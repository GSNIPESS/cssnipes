import { describe, expect, it } from "vitest";
import {
  GLICKO_INITIAL_RD,
  GLICKO_INITIAL_VOL,
  glickoDefault,
  glickoUpdate,
} from "@/analytics/glicko2";

describe("glicko-2", () => {
  it("winner gains rating, loser drops, both RDs shrink", () => {
    const winner = glickoUpdate(glickoDefault(), glickoDefault(), 1);
    const loser = glickoUpdate(glickoDefault(), glickoDefault(), 0);

    expect(winner.rating).toBeGreaterThan(1500);
    expect(loser.rating).toBeLessThan(1500);
    expect(winner.rd).toBeLessThan(GLICKO_INITIAL_RD);
    expect(loser.rd).toBeLessThan(GLICKO_INITIAL_RD);
    // Symmetric matchup → symmetric outcome.
    expect(winner.rating - 1500).toBeCloseTo(1500 - loser.rating, 6);
  });

  it("volatility stays near its initial value after an unsurprising result", () => {
    const next = glickoUpdate(glickoDefault(), glickoDefault(), 1);
    expect(next.vol).toBeGreaterThan(GLICKO_INITIAL_VOL - 0.001);
    expect(next.vol).toBeLessThan(GLICKO_INITIAL_VOL + 0.001);
  });

  it("upsets move ratings more than expected wins", () => {
    const strong = { rating: 1800, rd: 100, vol: 0.06 };
    const weak = { rating: 1400, rd: 100, vol: 0.06 };
    const upsetGain = glickoUpdate(weak, strong, 1).rating - weak.rating;
    const expectedGain = glickoUpdate(strong, weak, 1).rating - strong.rating;
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it("repeated wins converge upward without diverging", () => {
    let state = glickoDefault();
    let previous = state.rating;
    for (let i = 0; i < 20; i++) {
      state = glickoUpdate(state, glickoDefault(), 1);
      expect(state.rating).toBeGreaterThan(previous);
      previous = state.rating;
      expect(Number.isFinite(state.rating)).toBe(true);
      expect(Number.isFinite(state.rd)).toBe(true);
      expect(Number.isFinite(state.vol)).toBe(true);
    }
    expect(state.rd).toBeLessThan(GLICKO_INITIAL_RD / 2);
  });
});
