import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";

/**
 * Player match-history "props view": one row per match of the player's team
 * while they were rostered, with the player's kills/headshots aggregated over
 * the props scope — maps 1–2 for series, map 1 only for BO1s (never map 3,
 * even when a BO3 goes the distance). Stat cells stay null when the provider
 * plan exposes no map-level player statistics.
 */

const PROPS_SCOPE = (bestOf: number) => (bestOf <= 1 ? 1 : 2);

export interface PlayerMatchHistoryRow {
  matchId: string;
  date: Date;
  event: { slug: string; name: string };
  team: { slug: string; name: string };
  opponent: { slug: string; name: string };
  bestOf: number;
  scoreFor: number;
  scoreAgainst: number;
  won: boolean | null;
  /** Maps counted for props: 1 for BO1, otherwise first two maps. */
  propsMaps: number;
  kills: number | null;
  headshots: number | null;
  statsAvailable: boolean;
}

export async function getPlayerMatchHistory(
  playerId: string,
  take = 20
): Promise<PlayerMatchHistoryRow[]> {
  const rosters = await prisma.roster.findMany({
    where: { playerId },
    select: { teamId: true, startDate: true, endDate: true },
  });
  if (!rosters.length) return [];

  // Current membership (endDate null): include the team's full match
  // history — the provider does not expose real join dates, and roster
  // startDate is only "first observed by our sync". Closed memberships keep
  // their observed window.
  const windows = rosters.map((r) => ({
    status: MatchStatus.COMPLETED,
    ...(r.endDate
      ? { scheduledAt: { gte: r.startDate, lte: r.endDate } }
      : {}),
    OR: [{ teamAId: r.teamId }, { teamBId: r.teamId }],
  }));
  const teamIds = new Set(rosters.map((r) => r.teamId));

  const matches = await prisma.match.findMany({
    where: { OR: windows },
    orderBy: { scheduledAt: "desc" },
    take,
    include: {
      event: { select: { slug: true, name: true } },
      teamA: { select: { id: true, slug: true, name: true } },
      teamB: { select: { id: true, slug: true, name: true } },
      maps: {
        orderBy: { mapNumber: "asc" },
        select: {
          mapNumber: true,
          stats: {
            where: { playerId },
            select: { kills: true, headshots: true },
          },
        },
      },
    },
  });

  return matches.map((m) => {
    const own = teamIds.has(m.teamA.id) ? m.teamA : m.teamB;
    const opponent = own.id === m.teamA.id ? m.teamB : m.teamA;
    const scoreFor = own.id === m.teamA.id ? m.scoreA : m.scoreB;
    const scoreAgainst = own.id === m.teamA.id ? m.scoreB : m.scoreA;
    const propsMaps = PROPS_SCOPE(m.bestOf);

    const scopedStats = m.maps
      .filter((map) => map.mapNumber <= propsMaps)
      .flatMap((map) => map.stats);
    const statsAvailable = scopedStats.length > 0;

    return {
      matchId: m.id,
      date: m.scheduledAt,
      event: m.event,
      team: { slug: own.slug, name: own.name },
      opponent: { slug: opponent.slug, name: opponent.name },
      bestOf: m.bestOf,
      scoreFor,
      scoreAgainst,
      won: m.winnerId ? m.winnerId === own.id : null,
      propsMaps,
      kills: statsAvailable
        ? scopedStats.reduce((s, x) => s + x.kills, 0)
        : null,
      headshots: statsAvailable
        ? scopedStats.reduce((s, x) => s + x.headshots, 0)
        : null,
      statsAvailable,
    };
  });
}

/**
 * Performance timeline for the player's profile graph: their team's Elo at
 * each match date while the player was rostered — a real, explainable series
 * that exists for every player with team history. (Per-map kill series joins
 * in automatically once map-level stats exist.)
 */
export async function getPlayerPerformanceSeries(
  playerId: string,
  take = 40
): Promise<Array<{ label: Date; value: number }>> {
  const rows = await prisma.$queryRaw<Array<{ date: Date; rating: number }>>`
    SELECT tr.date, tr.rating
    FROM "Roster" r
    JOIN "TeamRating" tr ON tr."teamId" = r."teamId"
      AND tr.system = 'ELO'
      -- current membership: full team timeline (no real join date from
      -- provider); closed membership: observed window
      AND (r."endDate" IS NULL OR (tr.date >= r."startDate" AND tr.date <= r."endDate"))
    WHERE r."playerId" = ${playerId}
    ORDER BY tr.date DESC
    LIMIT ${take}`;
  return rows.reverse().map((r) => ({ label: r.date, value: Math.round(r.rating) }));
}

/** The player's team's next scheduled match, if any (for the projection card). */
export async function getPlayerUpcomingMatch(playerId: string) {
  const current = await prisma.roster.findFirst({
    where: { playerId, endDate: null },
    select: { teamId: true },
  });
  if (!current) return null;
  return prisma.match.findFirst({
    where: {
      status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
      OR: [{ teamAId: current.teamId }, { teamBId: current.teamId }],
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      bestOf: true,
      teamA: { select: { name: true } },
      teamB: { select: { name: true } },
    },
  });
}

/**
 * Expected props-scope kills for the player's next match: average kills over
 * their recorded props windows, scaled by opponent strength. Returns null
 * (with the reason) when no historical kill data exists — never fabricated.
 */
export function expectedPropsKills(
  history: PlayerMatchHistoryRow[],
  bestOf: number,
  opponentElo: number | null
): { value: number; basis: number } | null {
  const withStats = history.filter((h) => h.statsAvailable && h.kills !== null);
  if (withStats.length < 3) return null;

  const killsPerMap =
    withStats.reduce((s, h) => s + h.kills! / h.propsMaps, 0) / withStats.length;
  const difficulty = opponentElo
    ? Math.min(1.15, Math.max(0.85, 1500 / opponentElo))
    : 1;
  return {
    value: killsPerMap * PROPS_SCOPE(bestOf) * difficulty,
    basis: withStats.length,
  };
}
