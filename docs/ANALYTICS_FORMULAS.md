# Analytics formulas

Every research figure on the site is computed from stored results by the
formulas below. Nothing is fabricated; when an input is missing the metric is
omitted and the UI says why.

## Rating systems (`src/analytics/`)

- **Elo** (`elo.ts`) — start 1500, expected score `1/(1+10^((Rb−Ra)/400))`,
  K = 32 scaled by series margin: `K·(1 + 0.5·(mapDiff − 1))` (a 2-0 moves
  ratings 1.5× a 2-1). Replayed chronologically over every completed match.
- **Glicko-2** (`glicko2.ts`) — Glickman's algorithm verbatim (τ = 0.5,
  start 1500/RD 350/vol 0.06), one rating period per match.
- **TrueSkill** (`trueskill.ts`) — head-to-head update (β = 25/6, dynamics
  τ = 25/300), no draws. Displayed μ, stored σ.

## Projection Model v2 (`projection.ts` + `montecarlo.ts`)

Two stages: a deterministic **point estimate** of per-map win probability
feeds a seeded **100,000-draw Monte Carlo** series simulation.

### Stage 1 — point estimate (per-map win probability for A)

`pointEstimateA = clamp(ratingBlend + formAdj + mapAdj, 0.03, 0.97)`

- **ratingBlend** — 0.4·P_elo + 0.3·P_glicko + 0.3·P_trueskill (weights
  renormalized if a system lacks data). P_glicko uses the RD-combined
  expectation `g(√(RDa²+RDb²))`; P_trueskill is `Φ((μa−μb)/√(2β²+σa²+σb²))`.
- **formAdj** — `0.1·(formA − formB)/2` where form is the recency-decayed
  (0.85^age), opponent-weighted result mean over the last 10: a win counts
  `clamp(oppElo/1500, 0.6, 1.6)`, a loss counts `−(2 − thatWeight)`
  (beating strong teams helps more; losing to weak teams hurts more),
  normalized to −1..+1.
- **mapAdj** — `0.15·mean(edge_m)` over predicted-veto maps, where
  `edge_m = (shrunkWR_A(m) − shrunkWR_B(m))/2` and
  `shrunkWR = 0.5 + (wr − 0.5)·n/(n+6)`. Contributes 0 without per-map data
  (current provider plan).

### Stage 2 — Monte Carlo series simulation (100k draws)

Deterministic: the PRNG (mulberry32) is seeded from the match id via FNV-1a,
so a match always reports identical numbers. Each of the 100,000 draws:

1. **Samples skill uncertainty** — converts the point estimate to an Elo-scale
   difference `Δ = 400·log₁₀(p/(1−p))`, perturbs it by
   `N(0, σ)·(√½) − N(0, σ)·(√½)` with `σ = √(RDa² + RDb²)` (combined Glicko
   deviations; a moderate default of 200 each when Glicko is absent), then maps
   back through the logistic. Wide RDs → wide outcome bands; established teams →
   tight bands.
2. **Simulates the series** — plays maps until one team reaches
   `ceil(bestOf/2)`, applying per-map edges over the predicted veto order,
   recording the exact score and map count.

Reported: **probA** (share of series won), **90% credible interval** (5th–95th
percentile of the per-draw map probability), **score distribution**
(e.g. 2-0/2-1/1-2/0-2 shares), **expected maps played**, and **upset
probability** (share where the pre-match underdog wins).

- **Veto prediction** — standard order (BO3: ban/ban/pick/pick/ban/ban/
  decider; BO1: alternating bans); each team bans its weakest remaining map
  and picks its strongest by shrunk win rate.
- **Confidence** — HIGH/MEDIUM/LOW from how many component families have
  data (ratings; ≥5 form samples each; map data).
- **Expected props kills** (`props.ts`) — `avgKillsPerPropsMap(last recorded
  matches) × propsMaps(bestOf) × clamp(1500/oppElo, 0.85, 1.15)`; requires
  ≥3 recorded matches, else omitted.

Reference points logged for every simulation: point estimate vs simulated
series probability, credible interval, expected map count, upset probability,
and full score distribution — all rendered on the match page.

## Research splits (`src/lib/research.ts`)

Over a subject's completed matches (player = their teams' matches; full
history for the current team because the provider exposes no join dates,
observed windows for past teams):

- **Year / LAN / online / tier splits** — direct partitions of W-L by match
  year, `event.isLan`, and event tier.
- **vs Top 10 / Top 25** — opponent's position in the *current* internal Elo
  table at query time.
- **Streaks** — longest same-result runs in chronological order; current
  streak is the trailing run.
- **Best wins / worst losses** — wins sorted by opponent's Elo rank
  ascending; losses sorted by opponent's Elo ascending.
- **Strength of schedule** — mean opponent Elo over the last 20 matches.
- **Momentum** — `winRate(last 5) − winRate(previous 5)`, −1..+1.
- **Volatility** — population stddev of result values (win = +1, loss = −1)
  over the last 20; 0 = perfectly consistent, 1 = alternating.
- **Roster stability** (`queries/research.ts`) — membership changes per year
  of observed tracking, plus mean tenure (days) of the current lineup.
  "Observed" because the provider exposes no historical join dates.

## Rolling form & map strengths (`performance.ts`)

- **Rolling form** — per player, last 10 completed maps: mean rating/ADR/
  KAST, K/D = Σkills/Σdeaths. Requires map-level stats (data-gated).
- **Map strengths** — per team/map: win rate, round win rate, sample size
  over all completed maps (data-gated).

## Similarity (`similarity.ts`)

Cosine similarity over z-scored form vectors (rating, K/D, ADR, KAST) across
the active-player population, mapped from [−1, 1] to [0, 1]. Data-gated.

## Historical snapshots

Ratings "as of date D" resolve `DISTINCT ON (team) … WHERE date ≤ D ORDER BY
date DESC` against the per-match rating history — exact reconstruction, no
extra storage. Post-recompute Elo standings are also snapshotted into
`HistoricalSnapshot` for audit history.

## Not computable on current data (never faked)

Clutch tendency, round/economy analytics, travel/rest adjustments, per-map
player form — these require detailed match statistics (see
docs/PROVIDER_COVERAGE.md). LAN/online *adjustment factors* are expressed as
explicit LAN/online splits rather than opaque multipliers.
