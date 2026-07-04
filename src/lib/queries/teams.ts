import { prisma } from "@/lib/prisma";
import { RankingSource } from "@/generated/prisma/client";

/**
 * Teams with their latest HLTV rank and internal Elo, ordered by rank then
 * Elo. Bulk queries + in-memory merge — per-team includes don't scale past a
 * few thousand teams.
 */
export async function getTeamsOverview() {
  const [teams, latestElo, latestRank, activeCounts] = await Promise.all([
    prisma.team.findMany({
      where: { disbanded: false },
      select: { id: true, slug: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw<Array<{ teamId: string; rating: number }>>`
      SELECT DISTINCT ON ("teamId") "teamId", rating
      FROM "TeamRating" WHERE system = 'ELO'
      ORDER BY "teamId", date DESC`,
    prisma.ranking.findMany({
      where: { source: RankingSource.HLTV },
      orderBy: [{ teamId: "asc" }, { date: "desc" }],
      distinct: ["teamId"],
      select: { teamId: true, rank: true },
    }),
    prisma.roster.groupBy({
      by: ["teamId"],
      where: { endDate: null },
      _count: true,
    }),
  ]);

  const elo = new Map(latestElo.map((r) => [r.teamId, r.rating]));
  const rank = new Map(latestRank.map((r) => [r.teamId, r.rank]));
  const active = new Map(activeCounts.map((r) => [r.teamId, r._count]));

  return teams
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      country: t.country,
      rank: rank.get(t.id) ?? null,
      elo: elo.get(t.id) ?? null,
      activePlayers: active.get(t.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
        (b.elo ?? -Infinity) - (a.elo ?? -Infinity)
    );
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
