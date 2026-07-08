import { describe, expect, it } from "vitest";
import {
  mulberry32,
  seedFromString,
  simulateSeries,
} from "@/analytics/montecarlo";

describe("mulberry32 PRNG", () => {
  it("is deterministic per seed and spread across [0,1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const xs = Array.from({ length: 1000 }, () => a());
    const ys = Array.from({ length: 1000 }, () => b());
    expect(xs).toEqual(ys);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(seedFromString("navi")).not.toBe(seedFromString("faze"));
  });
});

describe("simulateSeries", () => {
  it("a 50/50 BO1 returns ~50% and one map", () => {
    const r = simulateSeries({
      baseMapProbA: 0.5,
      ratingSpread: 0,
      mapEdges: [],
      bestOf: 1,
      draws: 50000,
      seed: 42,
    });
    expect(r.probA).toBeGreaterThan(0.47);
    expect(r.probA).toBeLessThan(0.53);
    expect(r.expectedMaps).toBe(1);
    expect(r.scoreDistribution["1-0"] + r.scoreDistribution["0-1"]).toBeCloseTo(1, 6);
  });

  it("BO3 amplifies the favorite beyond the per-map probability", () => {
    const r = simulateSeries({
      baseMapProbA: 0.6,
      ratingSpread: 0,
      mapEdges: [],
      bestOf: 3,
      draws: 50000,
      seed: 7,
    });
    // P(win BO3) = p^2(3-2p) = 0.648 for p=0.6.
    expect(r.probA).toBeGreaterThan(0.6);
    expect(r.probA).toBeCloseTo(0.648, 1);
    expect(r.expectedMaps).toBeGreaterThan(2);
    expect(r.expectedMaps).toBeLessThanOrEqual(3);
  });

  it("score distribution keys are valid and sum to 1", () => {
    const r = simulateSeries({
      baseMapProbA: 0.55,
      ratingSpread: 120,
      mapEdges: [0.05, -0.03, 0.02],
      bestOf: 3,
      draws: 30000,
      seed: 99,
    });
    const keys = Object.keys(r.scoreDistribution).sort();
    expect(keys).toEqual(["0-2", "1-2", "2-0", "2-1"]);
    const sum = Object.values(r.scoreDistribution).reduce((s, p) => s + p, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("rating spread widens the credible interval", () => {
    const tight = simulateSeries({
      baseMapProbA: 0.55,
      ratingSpread: 20,
      mapEdges: [],
      bestOf: 3,
      draws: 40000,
      seed: 3,
    });
    const wide = simulateSeries({
      baseMapProbA: 0.55,
      ratingSpread: 300,
      mapEdges: [],
      bestOf: 3,
      draws: 40000,
      seed: 3,
    });
    const width = (ci: [number, number]) => ci[1] - ci[0];
    expect(width(wide.ci90)).toBeGreaterThan(width(tight.ci90));
  });

  it("upset probability is the underdog's share and is deterministic", () => {
    const args = {
      baseMapProbA: 0.7,
      ratingSpread: 150,
      mapEdges: [] as number[],
      bestOf: 3,
      draws: 20000,
      seed: 11,
    };
    const a = simulateSeries({ ...args });
    const b = simulateSeries({ ...args });
    expect(a.upsetProbability).toBe(b.upsetProbability);
    // Favorite is A (0.7); upset = A loses ≈ 1 - probA.
    expect(a.upsetProbability).toBeCloseTo(1 - a.probA, 6);
  });
});
