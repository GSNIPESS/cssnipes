import type { PrismaClient } from "@/generated/prisma/client";
import { ROLLING_WINDOW } from "./performance";

/**
 * Player similarity over z-scored form vectors (rating, K/D, ADR, KAST).
 * Computed on demand from the latest rolling stats — no persisted state.
 */

const FEATURES = ["rating", "kd", "adr", "kast"] as const;
type Feature = (typeof FEATURES)[number];

export interface SimilarPlayer {
  playerId: string;
  slug: string;
  nickname: string;
  role: string;
  team: { slug: string; name: string } | null;
  similarity: number; // 0..1, cosine over z-scores mapped from [-1,1]
}

export async function getSimilarPlayers(
  prisma: PrismaClient,
  playerId: string,
  take = 5
): Promise<SimilarPlayer[]> {
  // Latest rolling row per player.
  const rollingRows = await prisma.playerRollingStat.findMany({
    where: { window: ROLLING_WINDOW, player: { isActive: true } },
    orderBy: [{ playerId: "asc" }, { asOfDate: "desc" }],
    distinct: ["playerId"],
    include: {
      player: {
        select: {
          id: true,
          slug: true,
          nickname: true,
          role: true,
          rosters: {
            where: { endDate: null },
            select: { team: { select: { slug: true, name: true } } },
            take: 1,
          },
        },
      },
    },
  });

  const target = rollingRows.find((r) => r.playerId === playerId);
  if (!target || rollingRows.length < 3) return [];

  // z-score features across the population.
  const stats = new Map<Feature, { mean: number; std: number }>();
  for (const feature of FEATURES) {
    const values = rollingRows.map((r) => r[feature]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    stats.set(feature, { mean, std: Math.sqrt(variance) || 1 });
  }

  const vector = (row: (typeof rollingRows)[number]): number[] =>
    FEATURES.map((f) => {
      const { mean, std } = stats.get(f)!;
      return (row[f] - mean) / std;
    });

  const targetVec = vector(target);

  return rollingRows
    .filter((r) => r.playerId !== playerId)
    .map((r) => ({
      playerId: r.playerId,
      slug: r.player.slug,
      nickname: r.player.nickname,
      role: r.player.role,
      team: r.player.rosters[0]?.team ?? null,
      similarity: (cosine(targetVec, vector(r)) + 1) / 2,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, take);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
