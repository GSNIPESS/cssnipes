import { describe, expect, it } from "vitest";
import {
  opponentWeightedForm,
  predictVeto,
  projectFromInputs,
  ratingBlendProbability,
  shrunkWinRate,
  type MapStrengthInput,
  type TeamRatingsInput,
} from "@/analytics/projection";

const ratings = (elo: number): TeamRatingsInput => ({
  elo,
  glicko: { rating: elo + 200, rd: 100 },
  trueskill: { mu: 25 + (elo - 1500) / 40, sigma: 3 },
});

const mapPool = (rates: Record<string, [number, number]>): MapStrengthInput[] =>
  Object.entries(rates).map(([mapName, [winRate, sampleSize]], i) => ({
    mapId: `m${i}`,
    mapName,
    winRate,
    sampleSize,
  }));

describe("rating blend", () => {
  it("is 0.5 for identical teams and sums to 1", () => {
    const p = ratingBlendProbability(ratings(1500), ratings(1500));
    expect(p).toBeCloseTo(0.5, 6);
    const a = ratingBlendProbability(ratings(1600), ratings(1450))!;
    const b = ratingBlendProbability(ratings(1450), ratings(1600))!;
    expect(a + b).toBeCloseTo(1, 6);
    expect(a).toBeGreaterThan(0.5);
  });

  it("returns null with no rating data and renormalizes partial data", () => {
    const empty: TeamRatingsInput = { elo: null, glicko: null, trueskill: null };
    expect(ratingBlendProbability(empty, empty)).toBeNull();
    const eloOnly: TeamRatingsInput = { elo: 1600, glicko: null, trueskill: null };
    const eloOnlyWeaker: TeamRatingsInput = { elo: 1400, glicko: null, trueskill: null };
    expect(ratingBlendProbability(eloOnly, eloOnlyWeaker)!).toBeGreaterThan(0.7);
  });
});

describe("opponent-weighted form", () => {
  it("rewards beating strong opponents more than weak ones", () => {
    const vsStrong = opponentWeightedForm([{ won: true, opponentElo: 1700 }])!;
    const vsWeak = opponentWeightedForm([{ won: true, opponentElo: 1300 }])!;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });

  it("punishes losing to weak opponents more than to strong ones", () => {
    const toWeak = opponentWeightedForm([{ won: false, opponentElo: 1300 }])!;
    const toStrong = opponentWeightedForm([{ won: false, opponentElo: 1700 }])!;
    expect(toWeak).toBeLessThan(toStrong);
  });

  it("is null without matches and bounded in [-1, 1]", () => {
    expect(opponentWeightedForm([])).toBeNull();
    const all = opponentWeightedForm(
      Array.from({ length: 10 }, () => ({ won: true, opponentElo: 1900 }))
    )!;
    expect(all).toBeLessThanOrEqual(1);
    expect(all).toBeGreaterThan(0.5);
  });
});

describe("veto prediction", () => {
  const strengths: Record<string, [number, number]> = {
    Mirage: [0.7, 20],
    Inferno: [0.6, 20],
    Nuke: [0.55, 20],
    Ancient: [0.5, 20],
    Anubis: [0.45, 20],
    Dust2: [0.4, 20],
    Train: [0.3, 20],
  };
  const inverse: Record<string, [number, number]> = Object.fromEntries(
    Object.entries(strengths).map(([m, [w, n]]) => [m, [1 - w, n]])
  );

  it("BO3 produces 4 bans, 2 picks, 1 decider covering the pool", () => {
    const veto = predictVeto(3, [mapPool(strengths), mapPool(inverse)]);
    expect(veto.available).toBe(true);
    expect(veto.steps.filter((s) => s.action === "ban")).toHaveLength(4);
    expect(veto.steps.filter((s) => s.action === "pick")).toHaveLength(2);
    expect(veto.steps.filter((s) => s.action === "decider")).toHaveLength(1);
    expect(veto.predictedMaps).toHaveLength(3);
    // A's first ban is their worst map. B (inverse strengths) then bans
    // Mirage — A's best — so A's pick is their best REMAINING map: Inferno.
    expect(veto.steps[0]).toMatchObject({ action: "ban", team: "A", mapName: "Train" });
    expect(veto.steps[1]).toMatchObject({ action: "ban", team: "B", mapName: "Mirage" });
    expect(veto.steps.find((s) => s.action === "pick" && s.team === "A")?.mapName).toBe(
      "Inferno"
    );
  });

  it("BO1 bans down to a single map", () => {
    const veto = predictVeto(1, [mapPool(strengths), mapPool(inverse)]);
    expect(veto.available).toBe(true);
    expect(veto.predictedMaps).toHaveLength(1);
    expect(veto.steps.filter((s) => s.action === "ban")).toHaveLength(6);
  });

  it("is unavailable without map history for both teams", () => {
    const veto = predictVeto(3, [mapPool(strengths), []]);
    expect(veto.available).toBe(false);
    expect(veto.reason).toMatch(/not available/i);
  });

  it("shrinks small samples toward 0.5", () => {
    expect(shrunkWinRate(1, 1)).toBeLessThan(0.6);
    expect(shrunkWinRate(1, 100)).toBeGreaterThan(0.9);
  });
});

describe("full projection", () => {
  it("favors the stronger team and stays in [0.03, 0.97]", () => {
    const projection = projectFromInputs({
      ratingsA: ratings(1700),
      ratingsB: ratings(1400),
      formA: Array.from({ length: 10 }, () => ({ won: true, opponentElo: 1600 })),
      formB: Array.from({ length: 10 }, () => ({ won: false, opponentElo: 1400 })),
      mapsA: [],
      mapsB: [],
      bestOf: 3,
    });
    expect(projection.probA).toBeGreaterThan(0.75);
    expect(projection.probA).toBeLessThanOrEqual(0.97);
    expect(projection.probA + projection.probB).toBeCloseTo(1, 10);
    expect(projection.components.mapAdjustment).toBe(0);
    expect(projection.coverage.maps).toBe(false);
    expect(projection.confidence).toBe("MEDIUM"); // ratings + form, no maps
  });

  it("degrades to 0.5 base and LOW confidence with no data", () => {
    const empty: TeamRatingsInput = { elo: null, glicko: null, trueskill: null };
    const projection = projectFromInputs({
      ratingsA: empty,
      ratingsB: empty,
      formA: [],
      formB: [],
      mapsA: [],
      mapsB: [],
      bestOf: 3,
    });
    expect(projection.probA).toBeCloseTo(0.5, 6);
    expect(projection.confidence).toBe("LOW");
  });
});
