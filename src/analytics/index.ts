import type { PrismaClient } from "@/generated/prisma/client";
import { SnapshotEntity } from "@/generated/prisma/client";
import { recomputeTeamRatings } from "./ratings";
import { recomputeMapStrengths, recomputeRollingStats } from "./performance";

export { getSimilarPlayers } from "./similarity";
export { ROLLING_WINDOW } from "./performance";

export interface AnalyticsSummary {
  matchesProcessed: number;
  ratingRows: number;
  rollingStatRows: number;
  mapStrengthRows: number;
}

/**
 * Recomputes all derived analytics from raw results and writes a ranking
 * snapshot for historical comparisons. Deterministic; safe to run after
 * every ingestion.
 */
export async function recomputeAnalytics(
  prisma: PrismaClient
): Promise<AnalyticsSummary> {
  const ratings = await recomputeTeamRatings(prisma);
  const rollingStatRows = await recomputeRollingStats(prisma);
  const mapStrengthRows = await recomputeMapStrengths(prisma);

  // Snapshot the post-recompute Elo standings (top 100; DISTINCT ON keeps
  // the latest-per-team resolution in the database).
  const latestElo = await prisma.$queryRaw<Array<{ slug: string; rating: number }>>`
    SELECT t.slug, x.rating FROM (
      SELECT DISTINCT ON ("teamId") "teamId", rating
      FROM "TeamRating" WHERE system = 'ELO'
      ORDER BY "teamId", date DESC
    ) x JOIN "Team" t ON t.id = x."teamId"
    ORDER BY x.rating DESC LIMIT 100`;
  if (latestElo.length > 0) {
    const standings = latestElo.map((r, i) => ({
      rank: i + 1,
      team: r.slug,
      elo: Math.round(r.rating),
    }));
    await prisma.historicalSnapshot.create({
      data: {
        entity: SnapshotEntity.RANKING,
        date: new Date(),
        payload: { system: "ELO", standings },
      },
    });
  }

  return {
    matchesProcessed: ratings.matchesProcessed,
    ratingRows: ratings.ratingRows,
    rollingStatRows,
    mapStrengthRows,
  };
}
