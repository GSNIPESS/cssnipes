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
 * so "latest" is resolved per team via DISTINCT ON — Prisma's `distinct`
 * dedupes in memory, which does not scale to full rating history.
 */
export async function getLatestTeamRatings(system: RatingSystem) {
  const raw = await prisma.$queryRaw<
    Array<{
      teamId: string;
      rating: number;
      deviation: number | null;
      volatility: number | null;
      date: Date;
      slug: string;
      name: string;
      country: string | null;
    }>
  >`
    SELECT DISTINCT ON (tr."teamId")
      tr."teamId", tr.rating, tr.deviation, tr.volatility, tr.date,
      t.slug, t.name, t.country
    FROM "TeamRating" tr
    JOIN "Team" t ON t.id = tr."teamId"
    WHERE tr.system = ${system}::"RatingSystem"
    ORDER BY tr."teamId", tr.date DESC`;
  if (!raw.length) return { date: null, rows: [] };

  const rows = raw
    .map((r) => ({
      id: r.teamId,
      teamId: r.teamId,
      rating: r.rating,
      deviation: r.deviation,
      volatility: r.volatility,
      date: r.date,
      team: { slug: r.slug, name: r.name, country: r.country },
    }))
    .sort((a, b) => b.rating - a.rating);
  const date = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
  return { date, rows };
}
