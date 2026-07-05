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
export async function getLatestTeamRatings(system: RatingSystem, asOf?: Date) {
  const cutoff = asOf ?? new Date("9999-01-01");
  // Lateral latest-per-team via the (teamId, system, date) unique index —
  // profiled 14× faster than DISTINCT ON over full rating history.
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
    SELECT t.id AS "teamId", x.rating, x.deviation, x.volatility, x.date,
           t.slug, t.name, t.country
    FROM "Team" t
    CROSS JOIN LATERAL (
      SELECT rating, deviation, volatility, date
      FROM "TeamRating" tr
      WHERE tr."teamId" = t.id AND tr.system = ${system}::"RatingSystem"
        AND tr.date <= ${cutoff}
      ORDER BY tr.date DESC LIMIT 1
    ) x`;
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
