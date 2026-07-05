/**
 * Research splits engine — pure functions over a subject's completed matches
 * (a player's teams' matches, or a team's matches). Every output is
 * explainable from the inputs; formulas are documented in
 * docs/ANALYTICS_FORMULAS.md.
 */

export interface ResearchMatch {
  date: Date;
  won: boolean;
  opponent: {
    id: string;
    slug: string;
    name: string;
    elo: number | null;
    /** 1-based position in the latest Elo table, if rated. */
    rank: number | null;
  };
  tier: string; // S | A | B | C | QUALIFIER
  isLan: boolean;
  eventName: string;
  matchId: string;
}

export interface Record_ {
  played: number;
  won: number;
  lost: number;
}

export interface ResearchSplits {
  byYear: Array<{ year: number } & Record_>;
  lan: Record_;
  online: Record_;
  byTier: Array<{ tier: string } & Record_>;
  vsTop10: Record_;
  vsTop25: Record_;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: { kind: "W" | "L"; length: number } | null;
  bestWins: ResearchMatch[]; // highest-ranked opponents beaten
  worstLosses: ResearchMatch[]; // lowest-rated opponents lost to
  majorAppearances: number; // distinct S-tier events
  /** Mean opponent Elo over the last 20 matches (strength of schedule). */
  strengthOfSchedule: number | null;
  /** Win-rate(last 5) − win-rate(previous 5), −1..+1. */
  momentum: number | null;
  /** Population stddev of result values (±1) over last 20 — 0 = perfectly consistent. */
  volatility: number | null;
}

const record = (): Record_ => ({ played: 0, won: 0, lost: 0 });

function add(r: Record_, won: boolean) {
  r.played++;
  if (won) r.won++;
  else r.lost++;
}

/** Matches must be sorted newest-first. */
export function computeResearchSplits(matches: ResearchMatch[]): ResearchSplits {
  const byYear = new Map<number, Record_>();
  const byTier = new Map<string, Record_>();
  const lan = record();
  const online = record();
  const vsTop10 = record();
  const vsTop25 = record();
  const majors = new Set<string>();

  for (const m of matches) {
    const year = m.date.getUTCFullYear();
    if (!byYear.has(year)) byYear.set(year, record());
    add(byYear.get(year)!, m.won);

    if (!byTier.has(m.tier)) byTier.set(m.tier, record());
    add(byTier.get(m.tier)!, m.won);

    add(m.isLan ? lan : online, m.won);
    if (m.opponent.rank !== null && m.opponent.rank <= 10) add(vsTop10, m.won);
    if (m.opponent.rank !== null && m.opponent.rank <= 25) add(vsTop25, m.won);
    if (m.tier === "S") majors.add(m.eventName);
  }

  // Streaks over chronological order.
  const chrono = [...matches].reverse();
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let run = 0;
  let runWon: boolean | null = null;
  for (const m of chrono) {
    if (runWon === m.won) run++;
    else {
      run = 1;
      runWon = m.won;
    }
    if (m.won) longestWinStreak = Math.max(longestWinStreak, run);
    else longestLossStreak = Math.max(longestLossStreak, run);
  }
  const currentStreak =
    runWon === null ? null : { kind: runWon ? ("W" as const) : ("L" as const), length: run };

  const bestWins = matches
    .filter((m) => m.won && m.opponent.rank !== null)
    .sort((a, b) => a.opponent.rank! - b.opponent.rank!)
    .slice(0, 5);
  const worstLosses = matches
    .filter((m) => !m.won && m.opponent.elo !== null)
    .sort((a, b) => a.opponent.elo! - b.opponent.elo!)
    .slice(0, 5);

  const recent20 = matches.slice(0, 20);
  const oppElos = recent20
    .map((m) => m.opponent.elo)
    .filter((e): e is number => e !== null);
  const strengthOfSchedule = oppElos.length
    ? oppElos.reduce((s, e) => s + e, 0) / oppElos.length
    : null;

  let momentum: number | null = null;
  if (matches.length >= 10) {
    const rate = (xs: ResearchMatch[]) => xs.filter((m) => m.won).length / xs.length;
    momentum = rate(matches.slice(0, 5)) - rate(matches.slice(5, 10));
  }

  let volatility: number | null = null;
  if (recent20.length >= 5) {
    const values = recent20.map((m) => (m.won ? 1 : -1));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    volatility = Math.sqrt(
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    );
  }

  return {
    byYear: [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, r]) => ({ year, ...r })),
    lan,
    online,
    byTier: [...byTier.entries()]
      .sort((a, b) => TIER_ORDER.indexOf(a[0]) - TIER_ORDER.indexOf(b[0]))
      .map(([tier, r]) => ({ tier, ...r })),
    vsTop10,
    vsTop25,
    longestWinStreak,
    longestLossStreak,
    currentStreak,
    bestWins,
    worstLosses,
    majorAppearances: majors.size,
    strengthOfSchedule,
    momentum,
    volatility,
  };
}

const TIER_ORDER = ["S", "A", "B", "C", "QUALIFIER"];
