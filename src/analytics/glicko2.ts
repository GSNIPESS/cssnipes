/**
 * Glicko-2 (Glickman, http://www.glicko.net/glicko/glicko2.pdf), applied with
 * one rating period per match — appropriate for sparse esports schedules.
 */

export const GLICKO_INITIAL_RATING = 1500;
export const GLICKO_INITIAL_RD = 350;
export const GLICKO_INITIAL_VOL = 0.06;

const SCALE = 173.7178;
const TAU = 0.5;
const EPSILON = 1e-6;

export interface GlickoState {
  rating: number;
  rd: number;
  vol: number;
}

export const glickoDefault = (): GlickoState => ({
  rating: GLICKO_INITIAL_RATING,
  rd: GLICKO_INITIAL_RD,
  vol: GLICKO_INITIAL_VOL,
});

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectation(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** score: 1 = player won, 0 = lost, 0.5 = draw. */
export function glickoUpdate(
  player: GlickoState,
  opponent: GlickoState,
  score: number
): GlickoState {
  const mu = (player.rating - GLICKO_INITIAL_RATING) / SCALE;
  const phi = player.rd / SCALE;
  const muJ = (opponent.rating - GLICKO_INITIAL_RATING) / SCALE;
  const phiJ = opponent.rd / SCALE;

  const gJ = g(phiJ);
  const e = expectation(mu, muJ, phiJ);
  const v = 1 / (gJ * gJ * e * (1 - e));
  const delta = v * gJ * (score - e);

  // Volatility iteration (Illinois algorithm).
  const a = Math.log(player.vol * player.vol);
  const f = (x: number): number =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) /
      (2 * (phi * phi + v + Math.exp(x)) ** 2) -
    (x - a) / (TAU * TAU);

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const newVol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gJ * (score - e);

  return {
    rating: newMu * SCALE + GLICKO_INITIAL_RATING,
    rd: newPhi * SCALE,
    vol: newVol,
  };
}
