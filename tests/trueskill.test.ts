import { describe, expect, it } from "vitest";
import {
  TRUESKILL_INITIAL_MU,
  TRUESKILL_INITIAL_SIGMA,
  trueSkillConservative,
  trueSkillDefault,
  trueSkillUpdate,
} from "@/analytics/trueskill";

describe("trueskill", () => {
  it("matches the closed-form result for an even matchup", () => {
    const { winner, loser } = trueSkillUpdate(trueSkillDefault(), trueSkillDefault());
    // t=0 ⇒ v=√(2/π)≈0.79788; μ' = 25 ± (σ²/c)·v with β=25/6, τ=25/300.
    expect(winner.mu).toBeCloseTo(29.205, 2);
    expect(loser.mu).toBeCloseTo(20.795, 2);
    expect(winner.sigma).toBeCloseTo(7.195, 2);
    expect(winner.sigma).toBeLessThan(TRUESKILL_INITIAL_SIGMA);
    expect(winner.mu - TRUESKILL_INITIAL_MU).toBeCloseTo(
      TRUESKILL_INITIAL_MU - loser.mu,
      8
    );
  });

  it("an expected win barely moves ratings; an upset moves them a lot", () => {
    const strong = { mu: 35, sigma: 2 };
    const weak = { mu: 15, sigma: 2 };
    const expected = trueSkillUpdate(strong, weak);
    const upset = trueSkillUpdate(weak, strong);
    expect(expected.winner.mu - strong.mu).toBeLessThan(0.1);
    expect(upset.winner.mu - weak.mu).toBeGreaterThan(1);
  });

  it("sigma always decreases and stays positive", () => {
    let a = trueSkillDefault();
    let b = trueSkillDefault();
    for (let i = 0; i < 30; i++) {
      const result = trueSkillUpdate(a, b);
      expect(result.winner.sigma).toBeGreaterThan(0);
      expect(result.loser.sigma).toBeGreaterThan(0);
      a = result.winner;
      b = result.loser;
    }
    expect(a.sigma).toBeLessThan(TRUESKILL_INITIAL_SIGMA * 0.6);
    expect(trueSkillConservative(a)).toBeLessThan(a.mu);
  });
});
