# Provider coverage verification (PandaScore)

Verified 2026-07-04 with live authenticated probes plus current documentation.
Re-verify after any plan change: every blocked capability below activates
without code changes once the plan allows it.

## Import completeness (proven, not assumed)

| Check | Result |
| --- | --- |
| Provider's lowest match id (`sort=id`) | 52399 — equals our lowest imported id |
| Matches beyond our highest id (1572137) | 0 at verification time |
| Oldest imported match | 2016-01-13 |
| Backfill termination, all 4 tasks | empty page after exhaustion (SUCCEEDED, fetched=0) |
| Pagination interruptions | 4 hourly-quota pauses (HTTP 429), all resumed from saved cursors |
| Totals | 5,035 teams · 12,182 players · 7,807 events · 95,042 matches |

## Endpoint verification matrix

Authentication is valid (fixtures endpoints return 200 with the same key), so
403 responses below are plan-permission denials, not auth failures.

| Endpoint | Status | Meaning |
| --- | --- | --- |
| `/csgo/{teams,players,tournaments,matches}` | 200 | Included (Fixtures plan) |
| `/csgo/players/{id}/stats` | **403** | Historical plan required |
| `/csgo/teams/{id}/stats` | **403** | Historical plan required |
| `/csgo/games/{id}` (per-map detail) | **403** | Historical plan required |
| `/csgo/matches/{id}/players/stats` | **403** | Historical plan required |
| `/csgo/rankings` | 404 | Does not exist for CS |

## Documentation basis

- Plans overview (docs root, retrieved 2026-07-04): the free tier is
  "Fixtures Only" (schedules, results, formats, opponents, streams); the
  **Historical** plan adds "in-depth game, team and player statistics once a
  game has ended" — Counter-Strike listed with 20+ team data points and 50+
  player performance metrics; **Pro Live** adds real-time websocket feeds.
  https://developers.pandascore.co/docs
- Coverage breakdown: https://pandascore.co/stats#coverage
- Per-endpoint plan requirements: https://developers.pandascore.co/reference

## Consequences for features (all data-gated, zero fabrication)

Unavailable on the current plan — every one has schema, queries, and UI
already wired and activates automatically when data arrives:

- Player kills, headshots, ADR, KAST, damage, opening duels, utility damage
  (→ props columns, kill projections, form ratings, similarity engine)
- Per-map results (→ map win rates, pick/ban predictions, map pool evolution)
- Round/economy stats (→ round-level analytics)

Available and fully exploited: complete match history since 2016, series
scores, live/upcoming schedules, rosters, events with tier/prize/LAN flags —
which power all rating systems, projections, and research splits.
