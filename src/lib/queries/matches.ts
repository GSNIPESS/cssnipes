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
