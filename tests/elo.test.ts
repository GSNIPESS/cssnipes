import { describe, expect, it } from "vitest";
import { ELO_INITIAL, eloExpectedScore, eloUpdate } from "@/analytics/elo";

describe("elo", () => {
  it("expected score is 0.5 for equal ratings and sums to 1", () => {
    expect(eloExpectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
    const a = eloExpectedScore(1600, 1450);
    const b = eloExpectedScore(1450, 1600);
    expect(a + b).toBeCloseTo(1, 10);
    expect(a).toBeGreaterThan(0.5);
  });

  it("transfers exactly the delta between winner and loser", () => {
    const { winner, loser } = eloUpdate(ELO_INITIAL, ELO_INITIAL, 2, 1);
    expect(winner - ELO_INITIAL).toBeCloseTo(ELO_INITIAL - loser, 10);
    expect(winner).toBeCloseTo(1516, 5); // K=32, even odds, 2-1 margin
    expect(loser).toBeCloseTo(1484, 5);
  });

  it("scales gains by map margin (2-0 > 2-1)", () => {
    const sweep = eloUpdate(1500, 1500, 2, 0);
    const close = eloUpdate(1500, 1500, 2, 1);
    expect(sweep.winner).toBeGreaterThan(close.winner);
  });

  it("gives underdogs bigger gains than favorites", () => {
    const upset = eloUpdate(1400, 1600, 2, 0);
    const expected = eloUpdate(1600, 1400, 2, 0);
    expect(upset.winner - 1400).toBeGreaterThan(expected.winner - 1600);
  });
});
