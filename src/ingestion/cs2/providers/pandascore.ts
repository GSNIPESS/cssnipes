import { z } from "zod";
import { HttpBlockedError, HttpClient } from "../../core/http";
import type {
  FetchOptions,
  FetchResult,
  IngestionProvider,
  IngestionTask,
} from "../../core/types";
import type { Cs2Record } from "../schema";
import {
  cs2EventSchema,
  cs2MatchSchema,
  cs2PlayerSchema,
  cs2TeamSchema,
} from "../schema";

/**
 * PandaScore official esports API (https://developers.pandascore.co).
 * CS2 data is served under the `csgo` videogame namespace. Requires
 * PANDASCORE_API_KEY; until it is set the provider reports not_configured
 * and the runner skips it.
 *
 * Two sync modes, registered as separate providers so their cursors are
 * independent:
 *
 * - `pandascore` (incremental): sorted by modified_at descending; the newest
 *   modified_at is the cursor and paging stops at previously-seen records.
 *   Cheap; run frequently.
 * - `pandascore-backfill` (exhaustive): keyset pagination sorted by id
 *   ascending with `range[id]`; the cursor is the highest imported id.
 *   Resumable after any interruption (rate limits, quota); walks the full
 *   history until the API returns no more records.
 *
 * Team payloads include the current roster (`players`), so the teams task
 * also emits player records linked to the team — this is what keeps
 * team↔player relationships complete.
 */

const PAGE_SIZE = 100; // PandaScore maximum
const MAX_ID = 2147483647;

export type PandaScoreMode = "incremental" | "backfill";

// Defensive upstream shapes: only the fields we map, everything else ignored.
// Unexpected/missing fields degrade to warnings, never crashes.
const psTeamPlayer = z.looseObject({
  id: z.number(),
  name: z.string(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  nationality: z.string().nullish(),
  active: z.boolean().nullish(),
  birthday: z.string().nullish(),
});

const psTeam = z.looseObject({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullish(),
  location: z.string().nullish(),
  image_url: z.string().nullish(),
  players: z.array(psTeamPlayer).nullish(),
  modified_at: z.string().nullish(),
});

const psPlayer = z.looseObject({
  id: z.number(),
  name: z.string(), // in-game nickname
  slug: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  nationality: z.string().nullish(),
  active: z.boolean().nullish(),
  birthday: z.string().nullish(),
  current_team: z.looseObject({ id: z.number() }).nullish(),
  modified_at: z.string().nullish(),
});

const psTournament = z.looseObject({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullish(),
  tier: z.string().nullish(),
  prizepool: z.string().nullish(),
  begin_at: z.string().nullish(),
  end_at: z.string().nullish(),
  league: z.looseObject({ name: z.string().nullish() }).nullish(),
  serie: z.looseObject({ full_name: z.string().nullish() }).nullish(),
  modified_at: z.string().nullish(),
});

const psMatch = z.looseObject({
  id: z.number(),
  status: z.string().nullish(), // not_started | running | finished | canceled
  number_of_games: z.number().nullish(),
  scheduled_at: z.string().nullish(),
  begin_at: z.string().nullish(),
  end_at: z.string().nullish(),
  tournament_id: z.number().nullish(),
  winner_id: z.number().nullish(),
  opponents: z
    .array(z.looseObject({ opponent: z.looseObject({ id: z.number() }).nullish() }))
    .nullish(),
  results: z
    .array(z.looseObject({ team_id: z.number().nullish(), score: z.number().nullish() }))
    .nullish(),
  modified_at: z.string().nullish(),
});

const TIER_MAP: Record<string, "S" | "A" | "B" | "C"> = {
  s: "S",
  a: "A",
  b: "B",
  c: "C",
  d: "C",
};

const STATUS_MAP: Record<string, "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED"> = {
  not_started: "SCHEDULED",
  running: "LIVE",
  finished: "COMPLETED",
  canceled: "CANCELLED",
  postponed: "SCHEDULED",
};

const TASK_PATHS: Record<IngestionTask, string> = {
  teams: "/csgo/teams",
  players: "/csgo/players",
  events: "/csgo/tournaments",
  matches: "/csgo/matches",
};

interface MappedItem {
  records: Cs2Record[];
  sourceId: number;
  modifiedAt: Date | null;
}

export class PandaScoreProvider implements IngestionProvider<Cs2Record> {
  readonly name: string;
  readonly sport = "cs2" as const;
  readonly tasks = ["teams", "players", "events", "matches"] as const;

  private http: HttpClient | null = null;

  constructor(private readonly mode: PandaScoreMode = "incremental") {
    this.name = mode === "backfill" ? "pandascore-backfill" : "pandascore";
  }

  isConfigured(): boolean {
    return Boolean(process.env.PANDASCORE_API_KEY);
  }

  private client(): HttpClient {
    this.http ??= new HttpClient({
      baseUrl: "https://api.pandascore.co",
      headers: { authorization: `Bearer ${process.env.PANDASCORE_API_KEY}` },
      requestsPerSecond: 1, // hourly quota is the real constraint; stay polite
      maxRetries: 3,
    });
    return this.http;
  }

  async fetchTask(
    task: IngestionTask,
    { cursor, limit }: FetchOptions
  ): Promise<FetchResult<Cs2Record>> {
    const fetchedAt = new Date().toISOString();
    const warnings: string[] = [];

    try {
      const result =
        this.mode === "backfill"
          ? await this.fetchBackfill(task, cursor, limit, warnings)
          : await this.fetchIncremental(task, cursor, limit, warnings);
      return {
        ok: true,
        data: result.records,
        source: this.name,
        fetchedAt,
        warnings,
        health: warnings.length ? "degraded" : "healthy",
        nextCursor: result.nextCursor,
      };
    } catch (err) {
      if (err instanceof HttpBlockedError) {
        return {
          ok: false,
          data: [],
          source: this.name,
          fetchedAt,
          warnings: [...warnings, err.message],
          health: err.status === 401 || err.status === 403 ? "not_configured" : "blocked",
          nextCursor: cursor,
        };
      }
      return {
        ok: false,
        data: [],
        source: this.name,
        fetchedAt,
        warnings: [...warnings, err instanceof Error ? err.message : String(err)],
        health: "error",
        nextCursor: cursor,
      };
    }
  }

  /** Newest-first sync; stops once records older than the cursor appear. */
  private async fetchIncremental(
    task: IngestionTask,
    cursor: string | null,
    limit: number,
    warnings: string[]
  ): Promise<{ records: Cs2Record[]; nextCursor: string | null }> {
    const records: Cs2Record[] = [];
    const since = cursor ? new Date(cursor) : null;
    let newestModified = since;
    const maxPages = Math.max(1, Math.ceil(limit / PAGE_SIZE));

    pages: for (let page = 1; page <= maxPages; page++) {
      const payload = await this.client().getJson(TASK_PATHS[task], {
        "page[size]": String(PAGE_SIZE),
        "page[number]": String(page),
        sort: "-modified_at",
      });
      const items = this.asArray(payload, task, page, warnings);
      if (!items || items.length === 0) break;

      for (const raw of items) {
        const mapped = this.mapItem(task, raw, warnings);
        if (!mapped) continue;
        if (since && mapped.modifiedAt && mapped.modifiedAt <= since) {
          break pages; // everything after this is older than our cursor
        }
        if (mapped.modifiedAt && (!newestModified || mapped.modifiedAt > newestModified)) {
          newestModified = mapped.modifiedAt;
        }
        records.push(...mapped.records);
        if (records.length >= limit) break pages;
      }

      if (items.length < PAGE_SIZE) break;
    }

    return {
      records,
      nextCursor: newestModified ? newestModified.toISOString() : cursor,
    };
  }

  /**
   * Oldest-first exhaustive walk using keyset pagination on id. The cursor is
   * the highest id imported so far; every run resumes exactly where the last
   * one stopped, so interrupted backfills lose nothing.
   */
  private async fetchBackfill(
    task: IngestionTask,
    cursor: string | null,
    limit: number,
    warnings: string[]
  ): Promise<{ records: Cs2Record[]; nextCursor: string | null }> {
    const records: Cs2Record[] = [];
    let lastId = cursor ? Number(cursor) : 0;
    if (!Number.isFinite(lastId) || lastId < 0) lastId = 0;
    const maxPages = Math.max(1, Math.ceil(limit / PAGE_SIZE));

    for (let page = 0; page < maxPages; page++) {
      const payload = await this.client().getJson(TASK_PATHS[task], {
        "page[size]": String(PAGE_SIZE),
        sort: "id",
        "range[id]": `${lastId + 1},${MAX_ID}`,
      });
      const items = this.asArray(payload, task, page + 1, warnings);
      if (!items || items.length === 0) break; // history exhausted

      for (const raw of items) {
        const mapped = this.mapItem(task, raw, warnings);
        if (!mapped) {
          // Track progress past unmappable items so we never re-fetch them.
          const idOnly = z.looseObject({ id: z.number() }).safeParse(raw);
          if (idOnly.success && idOnly.data.id > lastId) lastId = idOnly.data.id;
          continue;
        }
        if (mapped.sourceId > lastId) lastId = mapped.sourceId;
        records.push(...mapped.records);
      }

      if (records.length >= limit) break;
      if (items.length < PAGE_SIZE) break; // final page
    }

    return { records, nextCursor: lastId > 0 ? String(lastId) : cursor };
  }

  private asArray(
    payload: unknown,
    task: IngestionTask,
    page: number,
    warnings: string[]
  ): unknown[] | null {
    if (Array.isArray(payload)) return payload;
    warnings.push(`${task} page ${page}: expected array, got ${typeof payload}`);
    return null;
  }

  private mapItem(
    task: IngestionTask,
    raw: unknown,
    warnings: string[]
  ): MappedItem | null {
    try {
      switch (task) {
        case "teams": {
          const t = psTeam.parse(raw);
          const team = cs2TeamSchema.parse({
            kind: "team",
            externalId: `pandascore:${t.id}`,
            name: t.name,
            slug: t.slug ?? undefined,
            country: t.location,
            logoUrl: t.image_url,
          });
          // Current roster ships with the team payload — emit the players
          // linked to this team so memberships stay complete.
          const roster: Cs2Record[] = (t.players ?? []).map((p) =>
            cs2PlayerSchema.parse({
              kind: "player",
              externalId: `pandascore:${p.id}`,
              nickname: p.name,
              firstName: p.first_name,
              lastName: p.last_name,
              country: p.nationality,
              isActive: p.active ?? undefined,
              birthdate: p.birthday,
              teamExternalId: `pandascore:${t.id}`,
            })
          );
          return {
            records: [team, ...roster],
            sourceId: t.id,
            modifiedAt: parseDate(t.modified_at),
          };
        }
        case "players": {
          const p = psPlayer.parse(raw);
          return {
            records: [
              cs2PlayerSchema.parse({
                kind: "player",
                externalId: `pandascore:${p.id}`,
                nickname: p.name,
                slug: p.slug ?? undefined,
                firstName: p.first_name,
                lastName: p.last_name,
                country: p.nationality,
                isActive: p.active ?? undefined,
                birthdate: p.birthday,
                teamExternalId: p.current_team
                  ? `pandascore:${p.current_team.id}`
                  : null,
              }),
            ],
            sourceId: p.id,
            modifiedAt: parseDate(p.modified_at),
          };
        }
        case "events": {
          const t = psTournament.parse(raw);
          const begin = parseDate(t.begin_at);
          if (!begin) {
            warnings.push(`tournament ${t.id} has no begin_at — skipped`);
            return null;
          }
          const name = [t.league?.name, t.serie?.full_name, t.name]
            .filter(Boolean)
            .join(" ");
          return {
            records: [
              cs2EventSchema.parse({
                kind: "event",
                externalId: `pandascore:${t.id}`,
                name: name || t.name,
                slug: t.slug ?? undefined,
                tier: t.tier ? TIER_MAP[t.tier.toLowerCase()] : undefined,
                prizePool: parsePrizePool(t.prizepool),
                startDate: begin,
                endDate: t.end_at,
              }),
            ],
            sourceId: t.id,
            modifiedAt: parseDate(t.modified_at),
          };
        }
        case "matches": {
          const m = psMatch.parse(raw);
          const teamIds = (m.opponents ?? [])
            .map((o) => o.opponent?.id)
            .filter((id): id is number => typeof id === "number");
          const scheduled = parseDate(m.scheduled_at) ?? parseDate(m.begin_at);
          if (teamIds.length !== 2 || !scheduled) {
            warnings.push(
              `match ${m.id}: missing opponents or schedule — skipped (TBD matchup)`
            );
            return null;
          }
          const [teamA, teamB] = teamIds;
          const scoreFor = (teamId: number) =>
            m.results?.find((r) => r.team_id === teamId)?.score ?? undefined;
          return {
            records: [
              cs2MatchSchema.parse({
                kind: "match",
                externalId: `pandascore:${m.id}`,
                eventExternalId: `pandascore:${m.tournament_id}`,
                teamAExternalId: `pandascore:${teamA}`,
                teamBExternalId: `pandascore:${teamB}`,
                bestOf: m.number_of_games ?? undefined,
                status: m.status ? STATUS_MAP[m.status] : undefined,
                scheduledAt: scheduled,
                startedAt: m.begin_at,
                endedAt: m.end_at,
                scoreA: scoreFor(teamA),
                scoreB: scoreFor(teamB),
                winner:
                  m.winner_id == null
                    ? null
                    : m.winner_id === teamA
                      ? "A"
                      : m.winner_id === teamB
                        ? "B"
                        : null,
              }),
            ],
            sourceId: m.id,
            modifiedAt: parseDate(m.modified_at),
          };
        }
      }
    } catch (err) {
      warnings.push(
        `${task} item failed validation: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`
      );
      return null;
    }
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** PandaScore prizepools are strings like "500000 United States Dollar". */
function parsePrizePool(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/[\d,]+/);
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
