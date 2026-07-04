import { prisma } from "@/lib/prisma";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

/** Teams with their latest HLTV rank and internal Elo, ordered by rank. */
export async function getTeamsOverview() {
  const teams = await prisma.team.findMany({
    where: { disbanded: false },
    include: {
      rankings: {
        where: { source: RankingSource.HLTV },
        orderBy: { date: "desc" },
        take: 1,
      },
      ratings: {
        where: { system: RatingSystem.ELO },
        orderBy: { date: "desc" },
        take: 1,
      },
      _count: { select: { rosters: { where: { endDate: null } } } },
    },
    orderBy: { name: "asc" },
  });

  return teams
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      country: t.country,
      rank: t.rankings[0]?.rank ?? null,
      elo: t.ratings[0]?.rating ?? null,
      activePlayers: t._count.rosters,
    }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

export function getTeamBySlug(slug: string) {
  return prisma.team.findUnique({
    where: { slug },
    include: {
      rosters: {
        where: { endDate: null },
        include: { player: { select: { slug: true, nickname: true, country: true } } },
        orderBy: { startDate: "asc" },
      },
      rankings: { orderBy: { date: "desc" }, take: 5 },
      ratings: { orderBy: { date: "desc" }, take: 60 },
      mapStrengths: {
        orderBy: { asOfDate: "desc" },
        include: { map: true },
      },
    },
  });
}

/** Win/loss record from completed matches. */
export async function getTeamRecord(teamId: string) {
  const [played, won] = await Promise.all([
    prisma.match.count({
      where: {
        status: "COMPLETED",
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
      },
    }),
    prisma.match.count({ where: { status: "COMPLETED", winnerId: teamId } }),
  ]);
  return { played, won, lost: played - won };
}
