import { prisma } from "@/lib/prisma";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

/** Latest ranking table for a source (most recent snapshot date). */
export async function getLatestRankings(source: RankingSource) {
  const latest = await prisma.ranking.findFirst({
    where: { source },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return { date: null, rows: [] };

  const rows = await prisma.ranking.findMany({
    where: { source, date: latest.date },
    include: { team: { select: { slug: true, name: true, country: true } } },
    orderBy: { rank: "asc" },
  });
  return { date: latest.date, rows };
}

/**
 * Latest rating per team for a rating system. Ratings are written per match,
 * so "latest" is resolved per team, not per snapshot date.
 */
export async function getLatestTeamRatings(system: RatingSystem) {
  const rows = await prisma.teamRating.findMany({
    where: { system },
    orderBy: [{ teamId: "asc" }, { date: "desc" }],
    distinct: ["teamId"],
    include: { team: { select: { slug: true, name: true, country: true } } },
  });
  if (!rows.length) return { date: null, rows: [] };

  rows.sort((a, b) => b.rating - a.rating);
  const date = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
  return { date, rows };
}
