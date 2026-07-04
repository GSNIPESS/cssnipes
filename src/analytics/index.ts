import type { PrismaClient } from "@/generated/prisma/client";
import { SnapshotEntity, RatingSystem } from "@/generated/prisma/client";
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

  // Snapshot the post-recompute Elo standings.
  const latestElo = await prisma.teamRating.findMany({
    where: { system: RatingSystem.ELO },
    orderBy: [{ teamId: "asc" }, { date: "desc" }],
    distinct: ["teamId"],
    include: { team: { select: { slug: true } } },
  });
  if (latestElo.length > 0) {
    const standings = [...latestElo]
      .sort((a, b) => b.rating - a.rating)
      .map((r, i) => ({ rank: i + 1, team: r.team.slug, elo: Math.round(r.rating) }));
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
