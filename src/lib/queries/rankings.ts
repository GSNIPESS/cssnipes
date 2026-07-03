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

/** Latest rating per team for a rating system. */
export async function getLatestTeamRatings(system: RatingSystem) {
  const latest = await prisma.teamRating.findFirst({
    where: { system },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return { date: null, rows: [] };

  const rows = await prisma.teamRating.findMany({
    where: { system, date: latest.date },
    include: { team: { select: { slug: true, name: true, country: true } } },
    orderBy: { rating: "desc" },
  });
  return { date: latest.date, rows };
}
