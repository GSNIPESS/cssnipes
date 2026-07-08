/**
 * Monte Carlo series simulation — Projection Model v2.
 *
 * The deterministic Model v1 blend gives a point estimate of per-map win
 * probability. The simulation adds what a point estimate cannot express:
 *
 * - **Rating uncertainty**: each draw samples both teams' "true" strength
 *   from a normal centered on the model estimate with spread from the
 *   combined Glicko rating deviations, so weakly-rated teams produce wide
 *   outcome bands and established teams narrow ones.
 * - **Series structure**: maps are simulated one by one (first to
 *   ceil(bestOf/2)), on the predicted-veto map order when map data exists,
 *   yielding exact score distributions and expected series length.
 *
 * Deterministic: the RNG is seeded (by match id in production), so the same
 * match always reports the same numbers. Formulas documented in
 * docs/ANALYTICS_FORMULAS.md.
 */

export interface SimulationInput {
  /** Model v1 point estimate that the simulation is centered on (0..1). */
  baseMapProbA: number;
  /** Combined skill uncertainty, expressed in Elo-like points (>= 0). */
  ratingSpread: number;
  /** Per-map edge shifts for team A over the predicted veto order (may be empty). */
  mapEdges: number[];
  bestOf: number;
  draws?: number;
  seed?: number;
}

export interface SimulationResult {
  draws: number;
  probA: number;
  /** 5th–95th percentile of the per-draw map probability (rating uncertainty). */
  ci90: [number, number];
  /** Series score → probability, e.g. "2-0" → 0.41. Keys are A-first. */
  scoreDistribution: Record<string, number>;
  expectedMaps: number;
  /** Probability the pre-match underdog (per base estimate) wins the series. */
  upsetProbability: number;
}

export const DEFAULT_DRAWS = 100_000;
const LOGISTIC_SCALE = 400; // Elo curve

/** mulberry32 — small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gaussian(rng: () => number): number {
  // Box–Muller; guard against log(0).
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const logistic = (diff: number) => 1 / (1 + 10 ** (-diff / LOGISTIC_SCALE));
const logit = (p: number) =>
  LOGISTIC_SCALE * Math.log10(p / (1 - p)); // inverse of the Elo curve

export function simulateSeries(input: SimulationInput): SimulationResult {
  const draws = input.draws ?? DEFAULT_DRAWS;
  const rng = mulberry32(input.seed ?? 1);
  const toWin = Math.ceil(input.bestOf / 2);
  const baseDiff = logit(clamp(input.baseMapProbA, 0.01, 0.99));
  const spread = Math.max(input.ratingSpread, 0);
  const favoriteIsA = input.baseMapProbA >= 0.5;

  let winsA = 0;
  let totalMaps = 0;
  let upsets = 0;
  const scores = new Map<string, number>();
  const perDrawP: number[] = [];
  // Sample the p-band on a fixed subset to keep memory flat.
  const pSampleEvery = Math.max(1, Math.floor(draws / 2000));

  for (let d = 0; d < draws; d++) {
    // One skill draw per team per series; RD-driven.
    const diff = baseDiff + gaussian(rng) * spread * Math.SQRT1_2 - gaussian(rng) * spread * Math.SQRT1_2;
    const pBase = logistic(diff);
    if (d % pSampleEvery === 0) perDrawP.push(pBase);

    let a = 0;
    let b = 0;
    let mapIndex = 0;
    while (a < toWin && b < toWin) {
      const edge = input.mapEdges[mapIndex] ?? 0;
      const p = clamp(pBase + edge, 0.02, 0.98);
      if (rng() < p) a++;
      else b++;
      mapIndex++;
    }
    totalMaps += a + b;
    const aWon = a === toWin;
    if (aWon) winsA++;
    if (aWon !== favoriteIsA) upsets++;
    const key = aWon ? `${toWin}-${b}` : `${a}-${toWin}`;
    scores.set(key, (scores.get(key) ?? 0) + 1);
  }

  perDrawP.sort((x, y) => x - y);
  const q = (p: number) => perDrawP[Math.min(perDrawP.length - 1, Math.floor(p * perDrawP.length))];

  const scoreDistribution: Record<string, number> = {};
  for (const [key, count] of [...scores.entries()].sort()) {
    scoreDistribution[key] = count / draws;
  }

  return {
    draws,
    probA: winsA / draws,
    ci90: [q(0.05), q(0.95)],
    scoreDistribution,
    expectedMaps: totalMaps / draws,
    upsetProbability: upsets / draws,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
