import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";

const matchListInclude = {
  event: { select: { slug: true, name: true, tier: true } },
  teamA: { select: { slug: true, name: true } },
  teamB: { select: { slug: true, name: true } },
} as const;

export function getLiveMatches(take = 10) {
  return prisma.match.findMany({
    where: { status: MatchStatus.LIVE },
    include: matchListInclude,
    orderBy: { scheduledAt: "asc" },
    take,
  });
}

export function getUpcomingMatches(take = 20) {
  return prisma.match.findMany({
    where: { status: MatchStatus.SCHEDULED },
    include: matchListInclude,
    orderBy: { scheduledAt: "asc" },
    take,
  });
}

export function getCompletedMatches(take = 20) {
  return prisma.match.findMany({
    where: { status: MatchStatus.COMPLETED },
    include: matchListInclude,
    orderBy: { scheduledAt: "desc" },
    take,
  });
}

/**
 * Upcoming and live matches within the next `days` days, grouped by UTC day.
 * Powers the day-by-day schedule so it "loads in day by day" as matches move
 * from scheduled → live → completed on each incremental sync.
 */
export async function getWeekSchedule(days = 7) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
      scheduledAt: { lte: horizon },
    },
    include: matchListInclude,
    orderBy: { scheduledAt: "asc" },
  });

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const key = dayKey(m.scheduledAt < now ? now : m.scheduledAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  // Emit every day in the window so the UI shows the full week, even empty days.
  const out: Array<{ date: string; matches: typeof matches }> = [];
  for (let i = 0; i < days; i++) {
    const key = dayKey(new Date(now.getTime() + i * 24 * 3600 * 1000));
    out.push({ date: key, matches: groups.get(key) ?? [] });
  }
  return out;
}

export function getMatchDetail(id: string) {
  return prisma.match.findUnique({
    where: { id },
    include: {
      event: { select: { slug: true, name: true, tier: true } },
      teamA: { select: { id: true, slug: true, name: true } },
      teamB: { select: { id: true, slug: true, name: true } },
      winner: { select: { slug: true, name: true } },
      maps: {
        orderBy: { mapNumber: "asc" },
        include: {
          map: true,
          pickedBy: { select: { slug: true, name: true } },
          stats: {
            orderBy: { rating: "desc" },
            include: {
              player: { select: { slug: true, nickname: true } },
              team: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      },
    },
  });
}

export function getTeamRecentMatches(teamId: string, take = 10) {
  return prisma.match.findMany({
    where: {
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
      status: { in: [MatchStatus.COMPLETED, MatchStatus.LIVE, MatchStatus.SCHEDULED] },
    },
    include: matchListInclude,
    orderBy: { scheduledAt: "desc" },
    take,
  });
}
