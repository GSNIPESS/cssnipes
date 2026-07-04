/**
 * Elo for best-of series. Margin of victory (map difference) scales the
 * K-factor so a 2-0 moves ratings more than a 2-1.
 */

export const ELO_INITIAL = 1500;
const K = 32;

export function eloExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface EloUpdate {
  winner: number;
  loser: number;
}

export function eloUpdate(
  winnerRating: number,
  loserRating: number,
  winnerMaps: number,
  loserMaps: number
): EloUpdate {
  const expected = eloExpectedScore(winnerRating, loserRating);
  const margin = Math.max(1, winnerMaps - loserMaps);
  const k = K * (1 + 0.5 * (margin - 1));
  const delta = k * (1 - expected);
  return { winner: winnerRating + delta, loser: loserRating - delta };
}
