import { prisma } from "@/lib/prisma";

/** Players with current team and latest rolling form, ordered by form rating. */
export async function getPlayersOverview() {
  const players = await prisma.player.findMany({
    where: { isActive: true },
    include: {
      rosters: {
        where: { endDate: null },
        include: { team: { select: { slug: true, name: true } } },
        take: 1,
      },
      rollingStats: { orderBy: { asOfDate: "desc" }, take: 1 },
    },
    orderBy: { nickname: "asc" },
  });

  return players
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      nickname: p.nickname,
      country: p.country,
      role: p.role,
      team: p.rosters[0]?.team ?? null,
      form: p.rollingStats[0] ?? null,
    }))
    .sort((a, b) => (b.form?.rating ?? 0) - (a.form?.rating ?? 0));
}

export function getPlayerBySlug(slug: string) {
  return prisma.player.findUnique({
    where: { slug },
    include: {
      rosters: {
        include: { team: { select: { slug: true, name: true } } },
        orderBy: { startDate: "desc" },
      },
      rollingStats: { orderBy: { asOfDate: "desc" } },
      transfers: {
        orderBy: { date: "desc" },
        include: {
          fromTeam: { select: { slug: true, name: true } },
          toTeam: { select: { slug: true, name: true } },
        },
      },
    },
  });
}

/** Recent per-map stat lines with match context. */
export function getPlayerRecentStats(playerId: string, take = 20) {
  return prisma.playerStat.findMany({
    where: { playerId },
    include: {
      matchMap: {
        include: {
          map: true,
          match: {
            include: {
              teamA: { select: { slug: true, name: true } },
              teamB: { select: { slug: true, name: true } },
              event: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { matchMap: { match: { scheduledAt: "desc" } } },
    take,
  });
}

/** Career aggregates across all recorded maps. */
export async function getPlayerCareerTotals(playerId: string) {
  const agg = await prisma.playerStat.aggregate({
    where: { playerId },
    _sum: { kills: true, deaths: true, assists: true },
    _avg: { adr: true, kast: true, rating: true },
    _count: true,
  });
  return {
    maps: agg._count,
    kills: agg._sum.kills ?? 0,
    deaths: agg._sum.deaths ?? 0,
    assists: agg._sum.assists ?? 0,
    adr: agg._avg.adr ?? 0,
    kast: agg._avg.kast ?? 0,
    rating: agg._avg.rating ?? 0,
  };
}
