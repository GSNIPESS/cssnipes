import type { PrismaClient } from "@/generated/prisma/client";
import { eloExpectedScore } from "./elo";
import { normCdf } from "./gaussian";
import {
  DEFAULT_DRAWS,
  seedFromString,
  simulateSeries,
  type SimulationResult,
} from "./montecarlo";

/**
 * CSSNIPES Projection Model v2 — research projection for an upcoming (or live)
 * match. A deterministic point estimate (v1) feeds a seeded 100k-draw Monte
 * Carlo simulation (v2). Every number is derived from stored results and
 * every component is returned so the output is fully explainable:
 *
 *   1. Rating blend — win probabilities from Elo, Glicko-2, and TrueSkill,
 *      blended 40/30/30 (renormalized if a system lacks data).
 *   2. Opponent-weighted form — last 10 results per team, recency-decayed
 *      (0.85^age) and weighted by opponent Elo, so beating strong teams
 *      counts more than farming weak ones.
 *   3. Map component — predicted veto from per-map win rates (sample-size
 *      shrunk); contributes only when both teams have map history.
 *   4. Monte Carlo — samples rating uncertainty (from Glicko RDs) and
 *      simulates the series map by map, giving score distributions, a 90%
 *      credible interval, expected map count, and upset probability.
 *
 * No odds, no external feeds, no fabricated inputs: components without data
 * contribute nothing and are flagged in `coverage`.
 */

const GLICKO_SCALE = 173.7178;
const TRUESKILL_BETA = 25 / 6;
const FORM_DECAY = 0.85;
const FORM_WINDOW = 10;
const FORM_WEIGHT = 0.1; // max probability shift from form differential
const MAP_WEIGHT = 0.15; // max probability shift from map edges
const SHRINK_N = 6; // pseudo-sample pulling map win rates toward 0.5

export interface TeamRatingsInput {
  elo: number | null;
  glicko: { rating: number; rd: number } | null;
  trueskill: { mu: number; sigma: number } | null;
}

export interface FormMatch {
  won: boolean;
  opponentElo: number | null;
}

export interface MapStrengthInput {
  mapId: string;
  mapName: string;
  winRate: number;
  sampleSize: number;
}

export interface VetoStep {
  action: "ban" | "pick" | "decider";
  team: "A" | "B" | null;
  mapName: string;
  reason: string;
}

export interface VetoPrediction {
  available: boolean;
  reason?: string;
  steps: VetoStep[];
  predictedMaps: string[];
}

export interface MatchProjection {
  probA: number;
  probB: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** Deterministic Model v1 point estimate before simulation (0..1). */
  pointEstimateA: number;
  components: {
    ratingBlend: number | null;
    formAdjustment: number;
    mapAdjustment: number;
    formA: number | null;
    formB: number | null;
  };
  coverage: {
    ratings: boolean;
    formA: number;
    formB: number;
    maps: boolean;
  };
  veto: VetoPrediction;
  /** 100k-draw Monte Carlo (Model v2): score bands, CI, upset probability. */
  simulation: SimulationResult;
}

// ---------- pure model core (unit-tested) ----------

export function ratingBlendProbability(
  a: TeamRatingsInput,
  b: TeamRatingsInput
): number | null {
  const parts: Array<{ p: number; w: number }> = [];

  if (a.elo !== null && b.elo !== null) {
    parts.push({ p: eloExpectedScore(a.elo, b.elo), w: 0.4 });
  }
  if (a.glicko && b.glicko) {
    const phi = Math.sqrt(a.glicko.rd ** 2 + b.glicko.rd ** 2) / GLICKO_SCALE;
    const g = 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
    const diff = (a.glicko.rating - b.glicko.rating) / GLICKO_SCALE;
    parts.push({ p: 1 / (1 + Math.exp(-g * diff)), w: 0.3 });
  }
  if (a.trueskill && b.trueskill) {
    const denom = Math.sqrt(
      2 * TRUESKILL_BETA ** 2 + a.trueskill.sigma ** 2 + b.trueskill.sigma ** 2
    );
    parts.push({ p: normCdf((a.trueskill.mu - b.trueskill.mu) / denom), w: 0.3 });
  }
  if (!parts.length) return null;

  const totalW = parts.reduce((s, x) => s + x.w, 0);
  return parts.reduce((s, x) => s + x.p * x.w, 0) / totalW;
}

/** −1..+1: recency-decayed, opponent-strength-weighted result score. */
export function opponentWeightedForm(matches: FormMatch[]): number | null {
  const recent = matches.slice(0, FORM_WINDOW);
  if (!recent.length) return null;
  let num = 0;
  let den = 0;
  recent.forEach((m, i) => {
    const recency = FORM_DECAY ** i;
    const strength = clamp((m.opponentElo ?? 1500) / 1500, 0.6, 1.6);
    // Beating a strong opponent scores more; losing to a weak one costs more.
    const weight = m.won ? strength : 2 - strength;
    num += recency * weight * (m.won ? 1 : -1);
    den += recency;
  });
  return clamp(num / den, -1.6, 1.6) / 1.6;
}

export function shrunkWinRate(winRate: number, sampleSize: number): number {
  return 0.5 + (winRate - 0.5) * (sampleSize / (sampleSize + SHRINK_N));
}

/**
 * Standard competitive veto order, driven by each team's shrunk per-map win
 * rate: teams ban their weakest remaining map and pick their strongest.
 * BO3: A ban, B ban, A pick, B pick, A ban, B ban, decider.
 * BO1: alternating bans, last map remaining is played.
 */
export function predictVeto(
  bestOf: number,
  pool: MapStrengthInput[][],
  labels: [string, string] = ["A", "B"]
): VetoPrediction {
  const [poolA, poolB] = pool;
  const mapNames = new Set([...poolA, ...poolB].map((m) => m.mapName));
  if (poolA.length === 0 || poolB.length === 0 || mapNames.size < 3) {
    return {
      available: false,
      reason:
        "Per-map results are not available for both teams (map-level data requires a provider plan that exposes it).",
      steps: [],
      predictedMaps: [],
    };
  }

  const score = (team: "A" | "B", mapName: string): number => {
    const entry = (team === "A" ? poolA : poolB).find((m) => m.mapName === mapName);
    return entry ? shrunkWinRate(entry.winRate, entry.sampleSize) : 0.5;
  };
  const describe = (team: "A" | "B", mapName: string): string => {
    const entry = (team === "A" ? poolA : poolB).find((m) => m.mapName === mapName);
    const label = team === "A" ? labels[0] : labels[1];
    return entry
      ? `${label}: ${(entry.winRate * 100).toFixed(0)}% over ${entry.sampleSize} maps`
      : `${label}: no recorded maps`;
  };

  const remaining = [...mapNames].sort();
  const steps: VetoStep[] = [];
  const picked: string[] = [];

  const takeWorst = (team: "A" | "B") =>
    remaining.reduce((worst, m) => (score(team, m) < score(team, worst) ? m : worst));
  const takeBest = (team: "A" | "B") =>
    remaining.reduce((best, m) => (score(team, m) > score(team, best) ? m : best));
  const remove = (mapName: string) =>
    remaining.splice(remaining.indexOf(mapName), 1);

  const ban = (team: "A" | "B") => {
    const m = takeWorst(team);
    steps.push({ action: "ban", team, mapName: m, reason: describe(team, m) });
    remove(m);
  };
  const pick = (team: "A" | "B") => {
    const m = takeBest(team);
    steps.push({ action: "pick", team, mapName: m, reason: describe(team, m) });
    picked.push(m);
    remove(m);
  };

  if (bestOf >= 3) {
    ban("A");
    if (remaining.length > 1) ban("B");
    if (remaining.length) pick("A");
    if (remaining.length) pick("B");
    if (remaining.length > 1) ban("A");
    if (remaining.length > 1) ban("B");
  } else {
    let turn: "A" | "B" = "A";
    while (remaining.length > 1) {
      ban(turn);
      turn = turn === "A" ? "B" : "A";
    }
  }
  if (remaining.length) {
    const decider = remaining[0];
    steps.push({
      action: "decider",
      team: null,
      mapName: decider,
      reason: "last map remaining",
    });
    picked.push(decider);
  }

  return { available: true, steps, predictedMaps: picked };
}

export function projectFromInputs(input: {
  ratingsA: TeamRatingsInput;
  ratingsB: TeamRatingsInput;
  formA: FormMatch[];
  formB: FormMatch[];
  mapsA: MapStrengthInput[];
  mapsB: MapStrengthInput[];
  bestOf: number;
  labels?: [string, string];
  /** Stable seed (match id) so the same match always simulates identically. */
  seed?: string;
  draws?: number;
}): MatchProjection {
  const ratingBlend = ratingBlendProbability(input.ratingsA, input.ratingsB);
  const formA = opponentWeightedForm(input.formA);
  const formB = opponentWeightedForm(input.formB);
  const formAdjustment =
    formA !== null && formB !== null ? (FORM_WEIGHT * (formA - formB)) / 2 : 0;

  const veto = predictVeto(input.bestOf, [input.mapsA, input.mapsB], input.labels);
  const mapEdges: number[] = [];
  let mapAdjustment = 0;
  if (veto.available && veto.predictedMaps.length) {
    for (const mapName of veto.predictedMaps) {
      const a = input.mapsA.find((m) => m.mapName === mapName);
      const b = input.mapsB.find((m) => m.mapName === mapName);
      const wrA = a ? shrunkWinRate(a.winRate, a.sampleSize) : 0.5;
      const wrB = b ? shrunkWinRate(b.winRate, b.sampleSize) : 0.5;
      // Per-map edge on the win-probability scale (half the win-rate gap).
      mapEdges.push((wrA - wrB) / 2);
    }
    mapAdjustment = MAP_WEIGHT * (mapEdges.reduce((s, e) => s + e, 0) / mapEdges.length);
  }

  const base = ratingBlend ?? 0.5;
  const pointEstimateA = clamp(base + formAdjustment + mapAdjustment, 0.03, 0.97);

  // Rating uncertainty (Elo points) from combined Glicko RDs — the wider the
  // RDs, the more the simulation spreads. Falls back to a moderate default
  // when Glicko data is missing so unrated matchups still show honest spread.
  const rdA = input.ratingsA.glicko?.rd ?? 200;
  const rdB = input.ratingsB.glicko?.rd ?? 200;
  const ratingSpread = Math.sqrt(rdA * rdA + rdB * rdB);

  const simulation = simulateSeries({
    baseMapProbA: pointEstimateA,
    ratingSpread,
    mapEdges,
    bestOf: input.bestOf,
    draws: input.draws ?? DEFAULT_DRAWS,
    seed: seedFromString(input.seed ?? `${input.bestOf}:${pointEstimateA.toFixed(4)}`),
  });

  const coverage = {
    ratings: ratingBlend !== null,
    formA: Math.min(input.formA.length, FORM_WINDOW),
    formB: Math.min(input.formB.length, FORM_WINDOW),
    maps: veto.available,
  };
  const score =
    (coverage.ratings ? 1 : 0) +
    (coverage.formA >= 5 && coverage.formB >= 5 ? 1 : 0) +
    (coverage.maps ? 1 : 0);
  const confidence = score >= 3 ? "HIGH" : score === 2 ? "MEDIUM" : "LOW";

  return {
    probA: simulation.probA,
    probB: 1 - simulation.probA,
    confidence,
    pointEstimateA,
    components: { ratingBlend, formAdjustment, mapAdjustment, formA, formB },
    coverage,
    simulation,
    veto,
  };
}

// ---------- database loader ----------

export async function projectMatch(
  prisma: PrismaClient,
  matchId: string
): Promise<
  | { available: false; reason: string }
  | ({ available: true; teamA: string; teamB: string } & MatchProjection)
> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      bestOf: true,
      status: true,
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
    },
  });
  if (!match) return { available: false, reason: "match not found" };
  if (match.status === "COMPLETED" || match.status === "CANCELLED") {
    return { available: false, reason: "match already decided" };
  }

  const [ratingsA, ratingsB, formA, formB, mapsA, mapsB] = await Promise.all([
    loadRatings(prisma, match.teamA.id),
    loadRatings(prisma, match.teamB.id),
    loadForm(prisma, match.teamA.id),
    loadForm(prisma, match.teamB.id),
    loadMapStrengths(prisma, match.teamA.id),
    loadMapStrengths(prisma, match.teamB.id),
  ]);

  const projection = projectFromInputs({
    ratingsA,
    ratingsB,
    formA,
    formB,
    mapsA,
    mapsB,
    bestOf: match.bestOf,
    labels: [match.teamA.name, match.teamB.name],
    seed: matchId,
  });

  return {
    available: true,
    teamA: match.teamA.name,
    teamB: match.teamB.name,
    ...projection,
  };
}

async function loadRatings(
  prisma: PrismaClient,
  teamId: string
): Promise<TeamRatingsInput> {
  const rows = await prisma.$queryRaw<
    Array<{ system: string; rating: number; deviation: number | null }>
  >`
    SELECT DISTINCT ON (system) system::text, rating, deviation
    FROM "TeamRating" WHERE "teamId" = ${teamId}
    ORDER BY system, date DESC`;
  const bySystem = new Map(rows.map((r) => [r.system, r]));
  const elo = bySystem.get("ELO");
  const glicko = bySystem.get("GLICKO");
  const trueskill = bySystem.get("TRUESKILL");
  return {
    elo: elo?.rating ?? null,
    glicko: glicko
      ? { rating: glicko.rating, rd: glicko.deviation ?? 350 }
      : null,
    trueskill: trueskill
      ? { mu: trueskill.rating, sigma: trueskill.deviation ?? 25 / 3 }
      : null,
  };
}

async function loadForm(prisma: PrismaClient, teamId: string): Promise<FormMatch[]> {
  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETED",
      winnerId: { not: null },
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    orderBy: { scheduledAt: "desc" },
    take: FORM_WINDOW,
    select: { teamAId: true, teamBId: true, winnerId: true },
  });
  return Promise.all(
    matches.map(async (m) => {
      const opponentId = m.teamAId === teamId ? m.teamBId : m.teamAId;
      const opp = await prisma.$queryRaw<Array<{ rating: number }>>`
        SELECT rating FROM "TeamRating"
        WHERE "teamId" = ${opponentId} AND system = 'ELO'
        ORDER BY date DESC LIMIT 1`;
      return { won: m.winnerId === teamId, opponentElo: opp[0]?.rating ?? null };
    })
  );
}

async function loadMapStrengths(
  prisma: PrismaClient,
  teamId: string
): Promise<MapStrengthInput[]> {
  const rows = await prisma.teamMapStrength.findMany({
    where: { teamId, map: { isActiveDuty: true } },
    orderBy: { asOfDate: "desc" },
    include: { map: { select: { displayName: true } } },
  });
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.mapId) ? false : (seen.add(r.mapId), true)))
    .map((r) => ({
      mapId: r.mapId,
      mapName: r.map.displayName,
      winRate: r.winRate,
      sampleSize: r.sampleSize,
    }));
}

/**
 * Compact veto predictions for a list of upcoming matches (one bulk map-
 * strength query for all teams). Returns a one-line summary per match id.
 */
export async function vetoLinesForMatches(
  prisma: PrismaClient,
  matches: Array<{ id: string; bestOf: number; teamAId: string; teamBId: string }>
): Promise<Map<string, string>> {
  const lines = new Map<string, string>();
  if (!matches.length) return lines;

  const teamIds = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]))];
  const rows = await prisma.teamMapStrength.findMany({
    where: { teamId: { in: teamIds }, map: { isActiveDuty: true } },
    orderBy: { asOfDate: "desc" },
    include: { map: { select: { displayName: true } } },
  });

  const byTeam = new Map<string, MapStrengthInput[]>();
  for (const r of rows) {
    const list = byTeam.get(r.teamId) ?? [];
    if (!list.some((m) => m.mapId === r.mapId)) {
      list.push({
        mapId: r.mapId,
        mapName: r.map.displayName,
        winRate: r.winRate,
        sampleSize: r.sampleSize,
      });
    }
    byTeam.set(r.teamId, list);
  }

  for (const m of matches) {
    const veto = predictVeto(m.bestOf, [
      byTeam.get(m.teamAId) ?? [],
      byTeam.get(m.teamBId) ?? [],
    ]);
    lines.set(
      m.id,
      veto.available
        ? veto.steps
            .map((s) =>
              s.action === "decider"
                ? `decider ${s.mapName}`
                : `${s.team} ${s.action} ${s.mapName}`
            )
            .join(" · ")
        : "Pick/ban prediction unavailable — per-map history is not exposed by the current data provider plan."
    );
  }
  return lines;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
