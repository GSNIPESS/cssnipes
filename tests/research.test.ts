import { describe, expect, it } from "vitest";
import {
  computeResearchSplits,
  deriveInsights,
  type ResearchMatch,
} from "@/lib/research";

let seq = 0;
const match = (
  won: boolean,
  overrides: Partial<ResearchMatch> = {}
): ResearchMatch => ({
  matchId: `m${seq}`,
  date: new Date(Date.UTC(2026, 5, 30 - seq++)), // newest-first sequence
  won,
  opponent: { id: "o", slug: "opp", name: "Opp", elo: 1500, rank: 50 },
  tier: "B",
  isLan: false,
  eventName: "Event",
  ...overrides,
});

describe("research splits", () => {
  it("partitions records by year, environment, and tier", () => {
    const splits = computeResearchSplits([
      match(true, { date: new Date("2026-05-01"), isLan: true, tier: "S" }),
      match(false, { date: new Date("2026-04-01"), tier: "S" }),
      match(true, { date: new Date("2025-01-01") }),
    ]);
    expect(splits.byYear).toEqual([
      { year: 2026, played: 2, won: 1, lost: 1 },
      { year: 2025, played: 1, won: 1, lost: 0 },
    ]);
    expect(splits.lan).toEqual({ played: 1, won: 1, lost: 0 });
    expect(splits.online.played).toBe(2);
    expect(splits.byTier[0]).toEqual({ tier: "S", played: 2, won: 1, lost: 1 });
    expect(splits.majorAppearances).toBe(1); // same S-tier event twice
  });

  it("computes top-N records from opponent rank", () => {
    const splits = computeResearchSplits([
      match(true, { opponent: { id: "a", slug: "a", name: "A", elo: 2400, rank: 3 } }),
      match(false, { opponent: { id: "b", slug: "b", name: "B", elo: 2200, rank: 20 } }),
      match(true, { opponent: { id: "c", slug: "c", name: "C", elo: 1500, rank: 900 } }),
    ]);
    expect(splits.vsTop10).toEqual({ played: 1, won: 1, lost: 0 });
    expect(splits.vsTop25).toEqual({ played: 2, won: 1, lost: 1 });
  });

  it("tracks streaks in chronological order", () => {
    // newest-first input: L, W, W, W, L → chronologically L W W W L
    const splits = computeResearchSplits([
      match(false),
      match(true),
      match(true),
      match(true),
      match(false),
    ]);
    expect(splits.longestWinStreak).toBe(3);
    expect(splits.longestLossStreak).toBe(1);
    expect(splits.currentStreak).toEqual({ kind: "L", length: 1 });
  });

  it("ranks best wins by opponent rank and worst losses by opponent elo", () => {
    const splits = computeResearchSplits([
      match(true, { opponent: { id: "a", slug: "a", name: "Top", elo: 2400, rank: 1 } }),
      match(true, { opponent: { id: "b", slug: "b", name: "Mid", elo: 1800, rank: 40 } }),
      match(false, { opponent: { id: "c", slug: "c", name: "Weak", elo: 1200, rank: 3000 } }),
      match(false, { opponent: { id: "d", slug: "d", name: "Strong", elo: 2300, rank: 5 } }),
    ]);
    expect(splits.bestWins[0].opponent.name).toBe("Top");
    expect(splits.worstLosses[0].opponent.name).toBe("Weak");
  });

  it("computes SoS, momentum, and volatility with documented formulas", () => {
    const wins5 = Array.from({ length: 5 }, () => match(true));
    const losses5 = Array.from({ length: 5 }, () => match(false));
    const splits = computeResearchSplits([...wins5, ...losses5]);
    expect(splits.strengthOfSchedule).toBeCloseTo(1500, 6);
    expect(splits.momentum).toBeCloseTo(1, 6); // 100% last 5 vs 0% previous 5
    expect(splits.volatility).toBeCloseTo(1, 6); // half +1, half −1 → stddev 1
    const steady = computeResearchSplits(Array.from({ length: 10 }, () => match(true)));
    expect(steady.volatility).toBeCloseTo(0, 6);
    expect(steady.momentum).toBeCloseTo(0, 6);
  });

  it("handles the empty case", () => {
    const splits = computeResearchSplits([]);
    expect(splits.byYear).toEqual([]);
    expect(splits.currentStreak).toBeNull();
    expect(splits.strengthOfSchedule).toBeNull();
    expect(splits.momentum).toBeNull();
  });
});

describe("derived insights", () => {
  it("states streaks and top-10 records factually", () => {
    const splits = computeResearchSplits([
      ...Array.from({ length: 5 }, () =>
        match(true, { opponent: { id: "t", slug: "t", name: "T", elo: 2300, rank: 4 } })
      ),
      match(false),
    ]);
    const insights = deriveInsights(splits);
    expect(insights.some((s) => s.includes("5-match winning streak"))).toBe(true);
    expect(insights.some((s) => s.includes("5–0 against current Top-10"))).toBe(true);
  });

  it("stays quiet without enough evidence", () => {
    const splits = computeResearchSplits([match(true), match(false)]);
    expect(deriveInsights(splits)).toEqual([]);
  });

  it("caps output at four insights", () => {
    const lan = Array.from({ length: 12 }, () =>
      match(true, { isLan: true, tier: "S", opponent: { id: "t", slug: "t", name: "T", elo: 2300, rank: 4 } })
    );
    const online = Array.from({ length: 12 }, () => match(false, { tier: "B" }));
    const insights = deriveInsights(computeResearchSplits([...lan, ...online]));
    expect(insights.length).toBeLessThanOrEqual(4);
    expect(insights.length).toBeGreaterThan(0);
  });
});
