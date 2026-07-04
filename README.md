# CSSNIPES — CS2 Research Platform

Research-first Counter-Strike 2 analytics: matches, players, teams, rankings,
per-map statistics, rating models, and comparison tooling on a normalized
PostgreSQL database. Built to extend to NHL/MLB by adding sport modules.
No sportsbook content.

Specifications live in [`docs/`](docs/); the phase plan is
[`docs/05_DEVELOPMENT_WORKFLOW.md`](docs/05_DEVELOPMENT_WORKFLOW.md).

## Stack

Next.js 16 (App Router, server components) · strict TypeScript · Tailwind v4 ·
Prisma 7 + PostgreSQL 17 · zod · Recharts · Vitest.

## Getting started

```bash
npm install
cp .env.example .env            # point DATABASE_URL at your Postgres
docker compose up -d            # or use a local Postgres
npx prisma migrate deploy
npx prisma generate
npm run db:seed                 # optional: deterministic sample data (no API key needed)
npm run dev                     # http://localhost:3000
```

For real CS2 data instead of the sample seed, set `PANDASCORE_API_KEY` in
`.env`, then:

```bash
npm run ingest -- --sport cs2 --provider pandascore
npm run analytics
```

Note: don't mix the sample seed with real imports — pick one. The PandaScore
free tier provides series-level results (teams, players, events, match
scores); per-map player stat lines require a higher data plan, so map-level
panels stay empty until such a source is connected.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app |
| `npm test` | Unit tests (rating math, schemas, rate limiter) |
| `npm run db:migrate` / `db:seed` / `db:studio` | Database workflows |
| `npm run ingest -- --list` | Show ingestion providers and configuration state |
| `npm run ingest -- --sport cs2 --provider pandascore` | Sync from PandaScore (needs `PANDASCORE_API_KEY`) |
| `npm run ingest -- --sport cs2 --provider local-json` | Import canonical JSON from `data/imports/cs2/` |
| `npm run analytics` | Recompute Elo / Glicko-2 / TrueSkill, rolling form, map strengths |

## Architecture

- `src/app` — routes: `/cs2/*` pages and the read-only REST API under
  `/api/v1/cs2/*` (matches, players, teams, events, rankings, search,
  player similarity).
- `src/lib/queries` — typed Prisma query layer shared by pages and API.
- `src/ingestion` — sport-agnostic pipeline (rate limiting, retries,
  incremental cursors, run audit log) + CS2 providers. See
  [`src/ingestion/README.md`](src/ingestion/README.md).
- `src/analytics` — pure rating implementations (Elo, Glicko-2, TrueSkill)
  replayed over completed matches, rolling player form, per-map team
  strengths, similarity engine, ranking snapshots.
- `prisma/` — schema and migrations.

## Deployment

1. Provision PostgreSQL and set `DATABASE_URL` (plus `PANDASCORE_API_KEY` to
   enable live ingestion).
2. `npx prisma migrate deploy` against the production database.
3. Either deploy to a Node host/Vercel, or build the container:
   `docker build -t cssnipes . && docker run -p 3000:3000 -e DATABASE_URL=... cssnipes`.
4. Schedule `npm run ingest -- --sport cs2 --provider pandascore` followed by
   `npm run analytics` (e.g. cron every 15 minutes) to keep data fresh.

CI (GitHub Actions) migrates + seeds a Postgres service, then runs lint,
unit tests, typecheck, and a production build on every push/PR.
