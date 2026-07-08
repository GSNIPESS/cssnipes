import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLES,
  opponentDifficultyFactor,
  projectPlayerProps,
  type PropsSample,
} from "@/analytics/player-props";

// Test-only synthetic samples — the app never fabricates these; they exist
// solely to exercise the engine's math.
const line = (kills: number, headshots: number): PropsSample => ({ kills, headshots });

describe("opponent difficulty factor", () => {
  it("suppresses vs stronger, inflates vs weaker, clamps at ±15%", () => {
    expect(opponentDifficultyFactor(1500)).toBeCloseTo(1, 6);
    expect(opponentDifficultyFactor(2000)).toBeLessThan(1);
    expect(opponentDifficultyFactor(1200)).toBeGreaterThan(1);
    expect(opponentDifficultyFactor(3000)).toBeCloseTo(0.85, 6); // clamped
    expect(opponentDifficultyFactor(1000)).toBeCloseTo(1.15, 6); // clamped
    expect(opponentDifficultyFactor(null)).toBe(1);
  });
});

describe("projectPlayerProps", () => {
  const consistent = Array.from({ length: 10 }, () => line(40, 20)); // 40k/20hs, 50% HS

  it("returns null below the sample threshold", () => {
    expect(projectPlayerProps([line(40, 20), line(38, 19)], 1500)).toBeNull();
    expect(projectPlayerProps([], 1500)).toBeNull();
    // Exactly MIN_SAMPLES is enough.
    expect(
      projectPlayerProps(Array.from({ length: MIN_SAMPLES }, () => line(40, 20)), 1500)
    ).not.toBeNull();
  });

  it("recovers the mean for consistent history vs even opponent", () => {
    const p = projectPlayerProps(consistent, 1500, { seed: "t" })!;
    expect(p.kills.expected).toBeGreaterThanOrEqual(39);
    expect(p.kills.expected).toBeLessThanOrEqual(41);
    expect(p.hsPercent).toBeCloseTo(0.5, 2);
    expect(p.headshots.expected).toBeGreaterThanOrEqual(19);
    expect(p.headshots.expected).toBeLessThanOrEqual(21);
  });

  it("never projects more headshots than kills", () => {
    const highHs = Array.from({ length: 8 }, () => line(30, 29)); // near-100% HS
    const p = projectPlayerProps(highHs, 1500, { seed: "hs" })!;
    expect(p.headshots.expected).toBeLessThanOrEqual(p.kills.expected);
    expect(p.headshots.high).toBeLessThanOrEqual(p.kills.high);
  });

  it("scales kills down vs a stronger opponent", () => {
    const even = projectPlayerProps(consistent, 1500, { seed: "s" })!;
    const tough = projectPlayerProps(consistent, 2200, { seed: "s" })!;
    expect(tough.meanKills).toBeLessThan(even.meanKills);
  });

  it("produces a wider interval for volatile history", () => {
    const steady = Array.from({ length: 10 }, () => line(40, 20));
    const swingy = [50, 20, 55, 15, 48, 22, 60, 10, 45, 18].map((k) => line(k, Math.round(k / 2)));
    const a = projectPlayerProps(steady, 1500, { seed: "z" })!;
    const b = projectPlayerProps(swingy, 1500, { seed: "z" })!;
    expect(b.kills.high - b.kills.low).toBeGreaterThan(a.kills.high - a.kills.low);
  });

  it("is deterministic for a fixed seed", () => {
    const a = projectPlayerProps(consistent, 1700, { seed: "fixed" })!;
    const b = projectPlayerProps(consistent, 1700, { seed: "fixed" })!;
    expect(a).toEqual(b);
  });
});
