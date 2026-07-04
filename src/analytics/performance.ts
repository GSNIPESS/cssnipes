import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { MapStatus, MatchStatus } from "@/generated/prisma/client";

export const ROLLING_WINDOW = "LAST_10_MAPS";

/**
 * Rebuilds PlayerRollingStat (last 10 completed maps per player) from raw
 * stat lines. asOfDate is the player's most recent map date, so reruns
 * without new data are no-ops.
 */
export async function recomputeRollingStats(prisma: PrismaClient): Promise<number> {
  // Only players with recorded stat lines can have rolling form.
  const withStats = await prisma.playerStat.groupBy({ by: ["playerId"] });
  const players = withStats.map((s) => ({ id: s.playerId }));
  const rows: Prisma.PlayerRollingStatCreateManyInput[] = [];

  for (const player of players) {
    const stats = await prisma.playerStat.findMany({
      where: {
        playerId: player.id,
        matchMap: { status: MapStatus.COMPLETED, match: { status: MatchStatus.COMPLETED } },
      },
      include: {
        matchMap: { select: { match: { select: { scheduledAt: true, endedAt: true } } } },
      },
      orderBy: { matchMap: { match: { scheduledAt: "desc" } } },
      take: 10,
    });
    if (stats.length === 0) continue;

    const kills = sum(stats.map((s) => s.kills));
    const deaths = sum(stats.map((s) => s.deaths));
    const latest = stats[0].matchMap.match;

    rows.push({
      playerId: player.id,
      window: ROLLING_WINDOW,
      rating: avg(stats.map((s) => s.rating)),
      kd: deaths > 0 ? kills / deaths : kills,
      adr: avg(stats.map((s) => s.adr)),
      kast: avg(stats.map((s) => s.kast)),
      sampleSize: stats.length,
      asOfDate: latest.endedAt ?? latest.scheduledAt,
    });
  }

  await prisma.$transaction([
    prisma.playerRollingStat.deleteMany({ where: { window: ROLLING_WINDOW } }),
    prisma.playerRollingStat.createMany({ data: rows, skipDuplicates: true }),
  ]);
  return rows.length;
}

/**
 * Rebuilds TeamMapStrength from completed maps: win rate, round win rate,
 * and sample size per (team, map).
 */
export async function recomputeMapStrengths(prisma: PrismaClient): Promise<number> {
  const maps = await prisma.matchMap.findMany({
    where: { status: MapStatus.COMPLETED, winnerId: { not: null } },
    select: {
      mapId: true,
      scoreA: true,
      scoreB: true,
      winnerId: true,
      match: {
        select: { teamAId: true, teamBId: true, scheduledAt: true, endedAt: true },
      },
    },
  });

  type Acc = { wins: number; played: number; roundsWon: number; rounds: number; latest: Date };
  const acc = new Map<string, Acc>(); // key: teamId|mapId

  const add = (
    teamId: string,
    mapId: string,
    won: boolean,
    roundsWon: number,
    roundsLost: number,
    date: Date
  ) => {
    const key = `${teamId}|${mapId}`;
    const entry = acc.get(key) ?? { wins: 0, played: 0, roundsWon: 0, rounds: 0, latest: date };
    entry.wins += won ? 1 : 0;
    entry.played += 1;
    entry.roundsWon += roundsWon;
    entry.rounds += roundsWon + roundsLost;
    if (date > entry.latest) entry.latest = date;
    acc.set(key, entry);
  };

  for (const map of maps) {
    const date = map.match.endedAt ?? map.match.scheduledAt;
    add(map.match.teamAId, map.mapId, map.winnerId === map.match.teamAId, map.scoreA, map.scoreB, date);
    add(map.match.teamBId, map.mapId, map.winnerId === map.match.teamBId, map.scoreB, map.scoreA, date);
  }

  const rows: Prisma.TeamMapStrengthCreateManyInput[] = [...acc.entries()].map(
    ([key, entry]) => {
      const [teamId, mapId] = key.split("|");
      return {
        teamId,
        mapId,
        winRate: entry.wins / entry.played,
        roundWinRate: entry.rounds > 0 ? entry.roundsWon / entry.rounds : null,
        sampleSize: entry.played,
        asOfDate: entry.latest,
      };
    }
  );

  await prisma.$transaction([
    prisma.teamMapStrength.deleteMany({}),
    prisma.teamMapStrength.createMany({ data: rows, skipDuplicates: true }),
  ]);
  return rows.length;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
