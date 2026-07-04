# CSSNIPES — CS2 Research Platform

Research-first Counter-Strike 2 analytics: matches, players, teams, events,
rating models, and comparison tooling on a normalized PostgreSQL database,
fed by real esports data. No sportsbook content.

## Goals

- A clean, fast research surface for CS2 results and team/player form.
- Honest data: everything rendered comes from the database; panels show
  explicit empty states when a data source doesn't provide a metric.
- Derived analytics that are deterministic and rebuildable from raw results.
- An architecture where adding a sport (NHL, MLB) means adding one module,
  not touching the core.

Project specifications live in [`docs/`](docs/); the original phase plan is
[`docs/05_DEVELOPMENT_WORKFLOW.md`](docs/05_DEVELOPMENT_WORKFLOW.md).
Operational procedures live in [`OPERATIONS.md`](OPERATIONS.md).

## Architecture overview

```
PandaScore API ──► ingestion (rate-limited, retrying, cursor-based, audited)
local JSON     ──►     │  idempotent upserts keyed by provider externalId
                       ▼
                 PostgreSQL (normalized: teams, players, rosters, events,
                       │     matches, maps, stats + ingestion audit)
                       ▼
                 analytics (Elo · Glicko-2 · TrueSkill replay, rolling form,
                       │     map strengths, similarity, ranking snapshots)
                       ▼
        typed query layer (src/lib/queries) ──► server-rendered UI (/cs2/*)
                                            ──► read-only REST API (/api/v1/cs2/*)
```

Design rules: providers never throw for upstream failures (they return a
result envelope with health state); derived tables are wiped and rebuilt by
the analytics job, never hand-edited; every page and endpoint reads through
the shared query layer.

## Technology stack

Next.js 16 (App Router, server components) · React 19 · strict TypeScript ·
Tailwind CSS v4 · Prisma 7 (driver adapter) + PostgreSQL 17 · zod · Recharts ·
Vitest · GitHub Actions CI · Docker (standalone output).

## Folder structure

```
docs/                 Product/database/analytics specifications
prisma/               schema.prisma, migrations, seed (dev fixtures)
public/               Static assets
scripts/              CLI entrypoints: ingest.ts, analytics.ts
src/
  analytics/          Rating math (elo, glicko2, trueskill, gaussian),
                      recompute jobs, similarity engine
  app/                Routes: /, /cs2/* pages, /api/v1/cs2/* handlers
  components/         Reusable UI + chart components
  ingestion/
    core/             Provider interface, HTTP client, rate limiter,
                      runner (cursors + audit), sport registry
    cs2/              Canonical zod schemas, Prisma mapper, providers
                      (pandascore, local-json)
  lib/                prisma singleton, api helpers, format, queries/
tests/                Vitest unit tests
```

## Installation

Requirements: Node 22+, PostgreSQL 17 (local `brew install postgresql@17`
or `docker compose up -d`).

```bash
git clone https://github.com/GSNIPESS/cssnipes.git && cd cssnipes
npm install
cp .env.example .env        # then edit values (see below)
npx prisma migrate deploy
npx prisma generate
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PANDASCORE_API_KEY` | for live data | Activates the PandaScore ingestion provider ([get a key](https://developers.pandascore.co)) |
| `CS2_IMPORT_DIR` | no | Override directory for `local-json` imports (default `data/imports/cs2`) |

`.env` is gitignored; `.env.example` is the template. Prisma loads `.env` via
`prisma.config.ts`; Next.js and the CLI scripts load it automatically.

## Database setup & migrations

```bash
npx prisma migrate deploy   # apply committed migrations (prod-safe)
npx prisma migrate status   # inspect state
npx prisma studio           # browse data
npm run db:seed             # OPTIONAL dev fixtures — do not mix with real imports
```

Schema changes go through `npx prisma migrate dev --name <change>` in
development; commit the generated folder under `prisma/migrations/`.

## Local development

```bash
npm run dev                 # http://localhost:3000
```

Real data: set `PANDASCORE_API_KEY`, then

```bash
npm run ingest -- --sport cs2 --provider pandascore
npm run analytics
```

## Ingestion commands

```bash
npm run ingest -- --list                                        # registered providers
npm run ingest -- --sport cs2 --provider pandascore             # full incremental sync
npm run ingest -- --sport cs2 --provider pandascore --task matches --limit 200
npm run ingest -- --sport cs2 --provider local-json             # canonical JSON import
```

Incremental (cursor per task), idempotent (externalId upserts), audited
(`IngestionRun` table). Details: [`src/ingestion/README.md`](src/ingestion/README.md).

## Analytics commands

```bash
npm run analytics
```

Replays completed matches through Elo, Glicko-2, and TrueSkill into
`TeamRating` history; rebuilds rolling player form and per-map team strengths;
snapshots standings. Deterministic — safe to run after every sync.

## Testing

```bash
npm test                    # vitest: rating math (incl. closed-form checks),
                            # schema validation, slugify, rate limiter
npx tsc --noEmit            # strict typecheck
npx eslint . --max-warnings 0
```

CI (GitHub Actions) runs migrate + seed against a Postgres service, then
lint, tests, typecheck, and a production build on every push/PR.

## API overview

Read-only JSON API. Success: `{ data, meta? }` · error:
`{ error: { code, message } }` · invalid params → 400, missing records → 404.
Responses send `cache-control: public, s-maxage=30, stale-while-revalidate=60`.

| Endpoint | Params | Returns |
| --- | --- | --- |
| `GET /api/v1/cs2/matches` | `status=live\|upcoming\|completed`, `limit` | Match list with teams + event |
| `GET /api/v1/cs2/matches/:id` | — | Match detail incl. maps + stat lines |
| `GET /api/v1/cs2/players` | `limit`, `offset` | Players with team + form (paginated) |
| `GET /api/v1/cs2/players/:slug` | — | Profile + career totals + recent stats |
| `GET /api/v1/cs2/players/:slug/similar` | — | Form-based similar players |
| `GET /api/v1/cs2/teams` | `limit`, `offset` | Teams with rank/Elo (paginated) |
| `GET /api/v1/cs2/teams/:slug` | — | Profile + roster + record + matches |
| `GET /api/v1/cs2/events` | `limit` | Events with match counts |
| `GET /api/v1/cs2/events/:slug` | — | Event + its matches |
| `GET /api/v1/cs2/rankings` | `source=hltv\|valve\|elo\|glicko\|trueskill` | Latest standings per source |
| `GET /api/v1/cs2/search` | `q` | Players + teams + events matching |

## Deployment overview

1. Provision managed PostgreSQL; set `DATABASE_URL` and `PANDASCORE_API_KEY`
   in the host's environment.
2. `npx prisma migrate deploy` against the production database.
3. Deploy: Vercel (framework preset works as-is) or the included
   [`Dockerfile`](Dockerfile) (standalone Node server on port 3000).
4. Schedule `npm run ingest -- --sport cs2 --provider pandascore && npm run analytics`
   every 15–30 min (external cron/GitHub Actions; Vercel Cron needs HTTP
   wrappers, planned for v1.1).
5. Add platform-level rate limiting / WAF in front of the public API.

Full runbook: [`OPERATIONS.md`](OPERATIONS.md).

## Future roadmap (v1.1)

- Per-map player statistics (kills, ADR, KAST, utility) from a source that
  licenses them — the schema, charts, similarity, and rolling-form panels
  already consume these once present.
- Enhanced player research pages and historical career analytics.
- HTTP wrappers for ingest/analytics to enable Vercel Cron.
- NHL and MLB sport modules on the existing ingestion core.
