import { normCdf, normPdf } from "./gaussian";

/**
 * TrueSkill head-to-head update (Herbrich, Minka & Graepel 2006) for two
 * teams treated as single rated entities. No draws (CS2 series always have
 * a winner).
 */

export const TRUESKILL_INITIAL_MU = 25;
export const TRUESKILL_INITIAL_SIGMA = 25 / 3;
const BETA = 25 / 6;
const DYNAMICS_TAU = 25 / 300;

export interface TrueSkillState {
  mu: number;
  sigma: number;
}

export const trueSkillDefault = (): TrueSkillState => ({
  mu: TRUESKILL_INITIAL_MU,
  sigma: TRUESKILL_INITIAL_SIGMA,
});

function vFn(t: number): number {
  const denom = normCdf(t);
  // Guard against catastrophic underflow for extreme upsets.
  if (denom < 1e-10) return -t;
  return normPdf(t) / denom;
}

function wFn(t: number): number {
  const v = vFn(t);
  return v * (v + t);
}

export function trueSkillUpdate(
  winner: TrueSkillState,
  loser: TrueSkillState
): { winner: TrueSkillState; loser: TrueSkillState } {
  // Dynamics noise keeps ratings adaptive over time.
  const sigmaW2 = winner.sigma ** 2 + DYNAMICS_TAU ** 2;
  const sigmaL2 = loser.sigma ** 2 + DYNAMICS_TAU ** 2;

  const c = Math.sqrt(2 * BETA ** 2 + sigmaW2 + sigmaL2);
  const t = (winner.mu - loser.mu) / c;
  const v = vFn(t);
  const w = wFn(t);

  return {
    winner: {
      mu: winner.mu + (sigmaW2 / c) * v,
      sigma: Math.sqrt(sigmaW2 * (1 - (sigmaW2 / c ** 2) * w)),
    },
    loser: {
      mu: loser.mu - (sigmaL2 / c) * v,
      sigma: Math.sqrt(sigmaL2 * (1 - (sigmaL2 / c ** 2) * w)),
    },
  };
}

/** Conservative displayed skill (μ − 3σ), TrueSkill's standard leaderboard value. */
export function trueSkillConservative(state: TrueSkillState): number {
  return state.mu - 3 * state.sigma;
}
