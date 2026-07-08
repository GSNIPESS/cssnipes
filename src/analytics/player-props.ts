import { mulberry32, seedFromString } from "./montecarlo";

/**
 * Player kills/headshots projection for maps 1–2 (map 1 only for BO1s).
 *
 * A seeded Monte Carlo bootstrap over the player's own recent maps-1+2 totals:
 * each draw resamples one historical match line, scales it by an opponent-
 * difficulty factor, and adds Gaussian jitter sized to the player's observed
 * spread. Headshots are drawn from the player's historical HS% applied to the
 * simulated kills, so HS can never exceed kills. Reports an exact expected
 * value (rounded mean) plus an 80% prediction interval.
 *
 * There is no fabrication: the engine requires real historical maps-1+2 stat
 * lines. With no samples it returns null, and the UI shows why. Formulas in
 * docs/ANALYTICS_FORMULAS.md.
 */

export interface PropsSample {
  /** Combined kills over the props-scope maps (1–2, or 1 for BO1). */
  kills: number;
  /** Combined headshots over the same maps (<= kills). */
  headshots: number;
}

export interface StatProjection {
  expected: number; // rounded mean — the "exact" prediction
  low: number; // 10th percentile
  high: number; // 90th percentile
}

export interface PlayerPropsProjection {
  sampleSize: number;
  kills: StatProjection;
  headshots: StatProjection;
  hsPercent: number; // historical headshot rate used
  meanKills: number; // unrounded, for bar scaling
}

export const MIN_SAMPLES = 3;
const DEFAULT_DRAWS = 20_000;

/**
 * Opponent difficulty multiplier for kill output: facing a stronger side
 * suppresses kills, a weaker side inflates them. Clamped to ±15%.
 */
export function opponentDifficultyFactor(opponentElo: number | null): number {
  if (opponentElo === null) return 1;
  return clamp(1500 / opponentElo, 0.85, 1.15);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1));
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function projectPlayerProps(
  samples: PropsSample[],
  opponentElo: number | null,
  opts: { draws?: number; seed?: string } = {}
): PlayerPropsProjection | null {
  if (samples.length < MIN_SAMPLES) return null;

  const draws = opts.draws ?? DEFAULT_DRAWS;
  const rng = mulberry32(seedFromString(opts.seed ?? "player-props"));
  const factor = opponentDifficultyFactor(opponentElo);

  const killList = samples.map((s) => s.kills);
  const muKills = mean(killList);
  const sdKills = stdev(killList, muKills);
  const totalKills = killList.reduce((s, x) => s + x, 0);
  const totalHs = samples.reduce((s, x) => s + x.headshots, 0);
  const hsRate = totalKills > 0 ? clamp(totalHs / totalKills, 0, 1) : 0;

  const killDraws: number[] = [];
  const hsDraws: number[] = [];
  for (let d = 0; d < draws; d++) {
    const pick = samples[Math.floor(rng() * samples.length)];
    // Bootstrap the historical line, scale by opponent, jitter by spread.
    const jitter = gaussian(rng) * sdKills * 0.5;
    const k = Math.max(0, Math.round(pick.kills * factor + jitter));
    // Per-draw HS rate wobbles around the player's historical rate.
    const rate = clamp(hsRate + gaussian(rng) * 0.05, 0, 1);
    killDraws.push(k);
    hsDraws.push(Math.min(k, Math.round(k * rate)));
  }

  return {
    sampleSize: samples.length,
    kills: summarize(killDraws),
    headshots: summarize(hsDraws),
    hsPercent: hsRate,
    meanKills: mean(killDraws),
  };
}

function summarize(draws: number[]): StatProjection {
  const sorted = [...draws].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    expected: Math.round(mean(draws)),
    low: q(0.1),
    high: q(0.9),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
