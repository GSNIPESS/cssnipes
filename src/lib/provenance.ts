/**
 * Data-integrity registry: every figure on the site belongs to exactly one
 * provenance class, and every computed metric documents its definition,
 * formula, and interpretation. Rendered at /cs2/methods and as badges on
 * metric cards.
 */

export type Provenance = "OBSERVED" | "MODEL" | "INFERRED";

export const PROVENANCE_LABELS: Record<
  Provenance,
  { label: string; description: string }
> = {
  OBSERVED: {
    label: "Observed",
    description:
      "Taken directly from the licensed data provider (PandaScore): matches, winners, scores, schedules, tournaments, rosters, dates.",
  },
  MODEL: {
    label: "Model",
    description:
      "Computed by CSSNIPES from observed results using the documented formulas below: ratings, momentum, consistency, projections, tendencies.",
  },
  INFERRED: {
    label: "Inferred",
    description:
      "Estimated where the provider leaves gaps, using stated assumptions (e.g. current-team history stands in for unknown roster join dates). Always labeled, never presented as observed.",
  },
};

export interface MetricDefinition {
  name: string;
  source: Provenance;
  definition: string;
  formula: string;
  interpretation: string;
}

export const METRICS: MetricDefinition[] = [
  {
    name: "Elo rating",
    source: "MODEL",
    definition: "Team strength from replaying every completed match since 2016.",
    formula:
      "Start 1500; expected = 1/(1+10^((Rb−Ra)/400)); K = 32·(1 + 0.5·(mapDiff−1)).",
    interpretation:
      "Higher is stronger; ~100 points ≈ 64% expected win rate against the lower side.",
  },
  {
    name: "Glicko-2 rating ± RD",
    source: "MODEL",
    definition: "Strength with an explicit uncertainty (rating deviation).",
    formula: "Glickman's Glicko-2, τ = 0.5, one rating period per match.",
    interpretation:
      "RD shrinks with activity; a wide RD means the rating is weakly established.",
  },
  {
    name: "TrueSkill μ/σ",
    source: "MODEL",
    definition: "Bayesian skill estimate updated per series.",
    formula: "Head-to-head TrueSkill update, β = 25/6, dynamics τ = 25/300.",
    interpretation: "μ is skill; σ is uncertainty that decays with results.",
  },
  {
    name: "Win probability (projection)",
    source: "MODEL",
    definition: "Chance a team wins an upcoming series.",
    formula:
      "Point estimate = clamp(ratingBlend + formAdj + mapAdj); 100k seeded Monte Carlo draws sample skill from combined RDs and simulate the series map by map.",
    interpretation:
      "The credible interval reflects rating uncertainty, not just simulation noise.",
  },
  {
    name: "Momentum",
    source: "MODEL",
    definition: "Direction of recent results.",
    formula: "winRate(last 5) − winRate(previous 5), −1..+1.",
    interpretation: "+0.4 means winning 40pp more often than the immediately prior stretch.",
  },
  {
    name: "Volatility / consistency",
    source: "MODEL",
    definition: "How streaky results are.",
    formula: "Population stddev of ±1 results over the last 20 matches.",
    interpretation: "0 = perfectly consistent; 1 = alternating results.",
  },
  {
    name: "Strength of schedule",
    source: "MODEL",
    definition: "Average quality of recent opposition.",
    formula: "Mean opponent Elo over the last 20 matches.",
    interpretation: "Compare to 1500 (long-run average team).",
  },
  {
    name: "Upset rating (completed match)",
    source: "MODEL",
    definition: "How surprising the result was.",
    formula:
      "100 × (1 − p_winner), where p_winner is the winner's pre-match Elo win probability.",
    interpretation: "50+ means the pre-match underdog won; 0 means a total formality.",
  },
  {
    name: "Tendencies (after wins/losses, vs stronger/weaker, rest)",
    source: "MODEL",
    definition: "Situational splits of completed results.",
    formula:
      "Partition matches by previous result, opponent's current Elo vs own, and rest days (≤2 short / 3–7 normal / >7 long); compare each split's win rate to the team's overall baseline.",
    interpretation:
      "Deltas vs baseline; small samples are shown with their n and should be read cautiously.",
  },
  {
    name: "Roster stability",
    source: "INFERRED",
    definition: "Lineup churn per year of observed tracking.",
    formula: "Closed roster rows ÷ years observed; tenure from first observation.",
    interpretation:
      "Inferred: the provider exposes no join dates, so tracking starts at first sync.",
  },
  {
    name: "Career research notes (players)",
    source: "MODEL",
    definition: "Countable facts over a player's teams' matches.",
    formula:
      "Unique opponents, career span, share of matches with current organization, S-tier appearances, Top-N records — direct counts; current-team history is used in full (join dates unknown, labeled inferred).",
    interpretation: "Every note is verifiable against the page it appears on.",
  },
  {
    name: "Player kills/headshots scoresheet",
    source: "MODEL",
    definition: "Projected maps-1–2 kills and headshots per player.",
    formula:
      "20k-draw bootstrap of the player's last 10 recorded maps-1+2 lines, opponent-scaled (clamp(1500/oppElo, 0.85, 1.15)), HS from historical HS%.",
    interpretation:
      "Requires recorded per-map stats (≥3 matches); locked on the current provider plan.",
  },
];
