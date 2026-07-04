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
 * and the runner skips it — connect the key and runs activate, no code
 * changes needed.
 *
 * Incremental sync: results are requested sorted by modified_at descending;
 * the newest modified_at is persisted as the cursor and paging stops once
 * items older than the previous cursor appear.
 */

const PAGE_SIZE = 50;
const MAX_PAGES = 10;

// Defensive upstream shapes: only the fields we map, everything else ignored.
// Unexpected/missing fields degrade to warnings, never crashes.
const psTeam = z.looseObject({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullish(),
  location: z.string().nullish(),
  image_url: z.string().nullish(),
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

export class PandaScoreProvider implements IngestionProvider<Cs2Record> {
  readonly name = "pandascore";
  readonly sport = "cs2" as const;
  readonly tasks = ["teams", "players", "events", "matches"] as const;

  private http: HttpClient | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.PANDASCORE_API_KEY);
  }

  private client(): HttpClient {
    this.http ??= new HttpClient({
      baseUrl: "https://api.pandascore.co",
      headers: { authorization: `Bearer ${process.env.PANDASCORE_API_KEY}` },
      requestsPerSecond: 1, // free tier is heavily rate limited
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
    const records: Cs2Record[] = [];
    const since = cursor ? new Date(cursor) : null;
    let newestModified = since;

    try {
      pages: for (let page = 1; page <= MAX_PAGES; page++) {
        const payload = await this.client().getJson(TASK_PATHS[task], {
          "page[size]": String(PAGE_SIZE),
          "page[number]": String(page),
          sort: "-modified_at",
        });

        if (!Array.isArray(payload)) {
          warnings.push(`${task} page ${page}: expected array, got ${typeof payload}`);
          break;
        }
        if (payload.length === 0) break;

        for (const raw of payload) {
          const mapped = this.mapItem(task, raw, warnings);
          if (!mapped) continue;
          if (since && mapped.modifiedAt && mapped.modifiedAt <= since) {
            break pages; // everything after this is older than our cursor
          }
          if (mapped.modifiedAt && (!newestModified || mapped.modifiedAt > newestModified)) {
            newestModified = mapped.modifiedAt;
          }
          records.push(mapped.record);
          if (records.length >= limit) break pages;
        }

        if (payload.length < PAGE_SIZE) break;
      }
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

    return {
      ok: true,
      data: records,
      source: this.name,
      fetchedAt,
      warnings,
      health: warnings.length ? "degraded" : "healthy",
      nextCursor: newestModified ? newestModified.toISOString() : cursor,
    };
  }

  private mapItem(
    task: IngestionTask,
    raw: unknown,
    warnings: string[]
  ): { record: Cs2Record; modifiedAt: Date | null } | null {
    try {
      switch (task) {
        case "teams": {
          const t = psTeam.parse(raw);
          return {
            record: cs2TeamSchema.parse({
              kind: "team",
              externalId: `pandascore:${t.id}`,
              name: t.name,
              slug: t.slug ?? undefined,
              country: t.location,
              logoUrl: t.image_url,
            }),
            modifiedAt: parseDate(t.modified_at),
          };
        }
        case "players": {
          const p = psPlayer.parse(raw);
          return {
            record: cs2PlayerSchema.parse({
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
            record: cs2EventSchema.parse({
              kind: "event",
              externalId: `pandascore:${t.id}`,
              name: name || t.name,
              slug: t.slug ?? undefined,
              tier: t.tier ? TIER_MAP[t.tier.toLowerCase()] : undefined,
              prizePool: parsePrizePool(t.prizepool),
              startDate: begin,
              endDate: t.end_at,
            }),
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
            record: cs2MatchSchema.parse({
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
