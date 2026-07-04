import { prisma } from "@/lib/prisma";

/**
 * Players with current team and latest rolling form, ordered by form rating
 * then nickname. Bulk queries + in-memory merge — per-player includes don't
 * scale past a few thousand players.
 */
export async function getPlayersOverview() {
  const [players, activeRosters, latestForm] = await Promise.all([
    prisma.player.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        nickname: true,
        country: true,
        role: true,
      },
      orderBy: { nickname: "asc" },
    }),
    prisma.roster.findMany({
      where: { endDate: null },
      select: {
        playerId: true,
        team: { select: { slug: true, name: true } },
      },
    }),
    prisma.playerRollingStat.findMany({
      orderBy: [{ playerId: "asc" }, { asOfDate: "desc" }],
      distinct: ["playerId"],
    }),
  ]);

  const teamByPlayer = new Map(activeRosters.map((r) => [r.playerId, r.team]));
  const formByPlayer = new Map(latestForm.map((f) => [f.playerId, f]));

  return players
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      nickname: p.nickname,
      country: p.country,
      role: p.role,
      team: teamByPlayer.get(p.id) ?? null,
      form: formByPlayer.get(p.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (b.form?.rating ?? 0) - (a.form?.rating ?? 0) ||
        a.nickname.localeCompare(b.nickname)
    );
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

/**
 * Research metrics derived purely from stored data: the player's team results
 * during their roster windows, events appeared at, and roster-mates. All
 * explainable — "record of the player's team while they were rostered".
 */
export async function getPlayerResearch(playerId: string) {
  const rosters = await prisma.roster.findMany({
    where: { playerId },
    select: { teamId: true, startDate: true, endDate: true },
  });
  if (rosters.length === 0) {
    return { career: null, recent: null, events: [], eventCount: 0, teammates: [] };
  }

  // Current membership: full team history (the provider exposes no real join
  // dates); closed memberships keep their observed window.
  const windows = rosters.map((r) => ({
    status: "COMPLETED" as const,
    ...(r.endDate ? { scheduledAt: { gte: r.startDate, lte: r.endDate } } : {}),
    OR: [{ teamAId: r.teamId }, { teamBId: r.teamId }],
  }));
  const teamIds = [...new Set(rosters.map((r) => r.teamId))];

  const matches = await prisma.match.findMany({
    where: { OR: windows },
    select: {
      winnerId: true,
      scheduledAt: true,
      event: { select: { id: true, slug: true, name: true, startDate: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const won = matches.filter((m) => m.winnerId && teamIds.includes(m.winnerId)).length;
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const recentMatches = matches.filter((m) => m.scheduledAt >= cutoff);
  const recentWon = recentMatches.filter(
    (m) => m.winnerId && teamIds.includes(m.winnerId)
  ).length;

  const eventsById = new Map<string, (typeof matches)[number]["event"]>();
  for (const m of matches) eventsById.set(m.event.id, m.event);
  const events = [...eventsById.values()]
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .slice(0, 8);

  // Roster-mates: players whose membership on the same team overlapped.
  const overlapping = await prisma.roster.findMany({
    where: { teamId: { in: teamIds }, playerId: { not: playerId } },
    include: {
      player: { select: { slug: true, nickname: true } },
      team: { select: { name: true } },
    },
  });
  const mates = new Map<string, { slug: string; nickname: string; team: string }>();
  for (const other of overlapping) {
    const mine = rosters.filter((r) => r.teamId === other.teamId);
    const overlaps = mine.some(
      (r) =>
        other.startDate <= (r.endDate ?? new Date(8640000000000000)) &&
        (other.endDate ?? new Date(8640000000000000)) >= r.startDate
    );
    if (overlaps && !mates.has(other.player.slug)) {
      mates.set(other.player.slug, {
        slug: other.player.slug,
        nickname: other.player.nickname,
        team: other.team.name,
      });
    }
  }

  return {
    career: { played: matches.length, won, lost: matches.length - won },
    recent: {
      played: recentMatches.length,
      won: recentWon,
      lost: recentMatches.length - recentWon,
    },
    events,
    eventCount: eventsById.size,
    teammates: [...mates.values()].slice(0, 12),
  };
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
