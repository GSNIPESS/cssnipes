import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";
import {
  computeResearchSplits,
  computeTendencies,
  type ResearchMatch,
} from "@/lib/research";

/**
 * Loaders that assemble ResearchMatch inputs for the splits engine.
 * Opponent strength context (latest Elo + rank) comes from one shared
 * DISTINCT ON query per request.
 */

async function latestEloTable(): Promise<Map<string, { elo: number; rank: number }>> {
  const rows = await prisma.$queryRaw<Array<{ teamId: string; rating: number }>>`
    SELECT t.id AS "teamId", x.rating
    FROM "Team" t
    CROSS JOIN LATERAL (
      SELECT rating FROM "TeamRating" tr
      WHERE tr."teamId" = t.id AND tr.system = 'ELO'
      ORDER BY tr.date DESC LIMIT 1
    ) x`;
  rows.sort((a, b) => b.rating - a.rating);
  return new Map(
    rows.map((r, i) => [r.teamId, { elo: r.rating, rank: i + 1 }])
  );
}

type MatchRow = {
  id: string;
  scheduledAt: Date;
  winnerId: string | null;
  teamAId: string;
  teamBId: string;
  teamA: { id: string; slug: string; name: string };
  teamB: { id: string; slug: string; name: string };
  event: { tier: string; isLan: boolean; name: string };
};

const matchSelect = {
  id: true,
  scheduledAt: true,
  winnerId: true,
  teamAId: true,
  teamBId: true,
  teamA: { select: { id: true, slug: true, name: true } },
  teamB: { select: { id: true, slug: true, name: true } },
  event: { select: { tier: true, isLan: true, name: true } },
} as const;

function toResearchMatches(
  rows: MatchRow[],
  subjectTeamIds: Set<string>,
  eloTable: Map<string, { elo: number; rank: number }>
): ResearchMatch[] {
  return rows
    .filter((m) => m.winnerId !== null)
    .map((m) => {
      const own = subjectTeamIds.has(m.teamAId) ? m.teamA : m.teamB;
      const opp = own.id === m.teamAId ? m.teamB : m.teamA;
      const strength = eloTable.get(opp.id);
      return {
        matchId: m.id,
        date: m.scheduledAt,
        won: m.winnerId === own.id,
        opponent: {
          id: opp.id,
          slug: opp.slug,
          name: opp.name,
          elo: strength?.elo ?? null,
          rank: strength?.rank ?? null,
        },
        tier: m.event.tier,
        isLan: m.event.isLan,
        eventName: m.event.name,
      };
    });
}

/** Research splits over the player's teams' matches (current team = full history). */
export async function getPlayerResearchSplits(playerId: string) {
  const rosters = await prisma.roster.findMany({
    where: { playerId },
    select: { teamId: true, startDate: true, endDate: true },
  });
  if (!rosters.length) return null;

  const windows = rosters.map((r) => ({
    status: MatchStatus.COMPLETED,
    ...(r.endDate ? { scheduledAt: { gte: r.startDate, lte: r.endDate } } : {}),
    OR: [{ teamAId: r.teamId }, { teamBId: r.teamId }],
  }));

  const [rows, eloTable] = await Promise.all([
    prisma.match.findMany({
      where: { OR: windows },
      select: matchSelect,
      orderBy: { scheduledAt: "desc" },
    }),
    latestEloTable(),
  ]);
  return computeResearchSplits(
    toResearchMatches(rows, new Set(rosters.map((r) => r.teamId)), eloTable)
  );
}

/** Research splits + situational tendencies over a team's complete history. */
export async function getTeamResearchSplits(teamId: string) {
  const [rows, eloTable] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: MatchStatus.COMPLETED,
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
      },
      select: matchSelect,
      orderBy: { scheduledAt: "desc" },
    }),
    latestEloTable(),
  ]);
  const research = toResearchMatches(rows, new Set([teamId]), eloTable);
  return {
    splits: computeResearchSplits(research),
    tendencies: computeTendencies(research, eloTable.get(teamId)?.elo ?? null),
  };
}

/**
 * Roster stability: changes per year of observed history plus current-core
 * tenure — documented in docs/ANALYTICS_FORMULAS.md.
 */
export async function getRosterStability(teamId: string) {
  const rosters = await prisma.roster.findMany({
    where: { teamId },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  if (!rosters.length) return null;

  const observedFrom = rosters[0].startDate;
  const years = Math.max(
    (Date.now() - observedFrom.getTime()) / (365.25 * 24 * 3600 * 1000),
    1 / 12
  );
  const changes = rosters.filter((r) => r.endDate !== null).length;
  const active = rosters.filter((r) => r.endDate === null);
  const avgTenureDays = active.length
    ? active.reduce((s, r) => s + (Date.now() - r.startDate.getTime()), 0) /
      active.length /
      (24 * 3600 * 1000)
    : null;

  return {
    observedFrom,
    changesPerYear: changes / years,
    activePlayers: active.length,
    avgTenureDays,
  };
}

/** Head-to-head between two teams: record plus recent meetings. */
export async function getHeadToHead(teamAId: string, teamBId: string) {
  const meetings = await prisma.match.findMany({
    where: {
      status: MatchStatus.COMPLETED,
      OR: [
        { teamAId, teamBId },
        { teamAId: teamBId, teamBId: teamAId },
      ],
    },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      scheduledAt: true,
      winnerId: true,
      scoreA: true,
      scoreB: true,
      teamAId: true,
      event: { select: { slug: true, name: true } },
    },
  });

  const winsA = meetings.filter((m) => m.winnerId === teamAId).length;
  const winsB = meetings.filter((m) => m.winnerId === teamBId).length;
  return {
    meetings: meetings.length,
    winsA,
    winsB,
    recent: meetings.slice(0, 8).map((m) => ({
      matchId: m.id,
      date: m.scheduledAt,
      event: m.event,
      wonByA: m.winnerId === teamAId,
      score:
        m.teamAId === teamAId ? `${m.scoreA}:${m.scoreB}` : `${m.scoreB}:${m.scoreA}`,
    })),
  };
}

/**
 * Shared history between two players: teams both played for, teammates both
 * shared, and events both appeared at (via their teams' matches).
 */
export async function getPlayerSharedHistory(playerAId: string, playerBId: string) {
  const [rostersA, rostersB] = await Promise.all(
    [playerAId, playerBId].map((id) =>
      prisma.roster.findMany({
        where: { playerId: id },
        select: { teamId: true, team: { select: { slug: true, name: true } } },
      })
    )
  );
  const teamsA = new Map(rostersA.map((r) => [r.teamId, r.team]));
  const sharedTeams = rostersB
    .filter((r) => teamsA.has(r.teamId))
    .map((r) => r.team)
    .filter((t, i, xs) => xs.findIndex((x) => x.slug === t.slug) === i);

  const mates = async (playerId: string) =>
    new Set(
      (
        await prisma.roster.findMany({
          where: {
            teamId: { in: (playerId === playerAId ? rostersA : rostersB).map((r) => r.teamId) },
            playerId: { not: playerId },
          },
          select: { playerId: true },
        })
      ).map((r) => r.playerId)
    );
  const [matesA, matesB] = await Promise.all([mates(playerAId), mates(playerBId)]);
  const sharedTeammateIds = [...matesA].filter((id) => matesB.has(id));
  const sharedTeammates = sharedTeammateIds.length
    ? await prisma.player.findMany({
        where: { id: { in: sharedTeammateIds.slice(0, 12) } },
        select: { slug: true, nickname: true },
      })
    : [];

  return { sharedTeams, sharedTeammates };
}
