# Operations Runbook

Day-2 operations for the CSSNIPES CS2 research platform.

## Starting the application

```bash
npm run dev                 # development (loads .env automatically)
npm run build               # production build (output: standalone)
node .next/standalone/server.js   # production server (needs DATABASE_URL, PORT)
```

For the standalone server, copy assets once after each build:

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Or build/run the container: `docker build -t cssnipes . && docker run -p 3000:3000 -e DATABASE_URL=... cssnipes`.

## Running migrations

```bash
npx prisma migrate deploy    # apply pending migrations (production-safe)
npx prisma migrate status    # check state
npx prisma migrate dev --name <change>   # development only: create a migration
```

Always run `migrate deploy` against a new database before first start.

## Running ingestion

```bash
npm run ingest -- --list                              # providers + config state
npm run ingest -- --sport cs2 --provider pandascore   # incremental sync (all tasks)
npm run ingest -- --sport cs2 --provider pandascore --task matches
npm run ingest -- --sport cs2 --provider local-json   # import data/imports/cs2/*.json
```

- Tasks run in dependency order: teams → players → events → matches.
- Sync is incremental (cursor per sport/provider/task in `IngestionSyncState`)
  and idempotent (upserts keyed by provider externalId) — safe to re-run anytime.
- Every run writes an `IngestionRun` audit row (status, counts, warnings, error).
- A first full sync takes ~1 minute (rate-limited to 1 req/s); incremental
  re-runs take seconds.

## Running analytics

```bash
npm run analytics
```

Recomputes Elo, Glicko-2, and TrueSkill rating histories from all completed
matches, rolling player form, per-map team strengths, and writes a ranking
snapshot. Deterministic and idempotent (~1–2s per 400 matches). Run after
every ingestion.

## Scheduling recurring ingestion

Run this pair on a schedule (every 15–30 minutes is appropriate for match
freshness):

```bash
npm run ingest -- --sport cs2 --provider pandascore && npm run analytics
```

Options:
- **Server/VM**: cron entry invoking the two commands in the repo directory.
- **GitHub Actions**: `schedule:` workflow with `DATABASE_URL` and
  `PANDASCORE_API_KEY` as repository secrets.
- **Vercel**: Vercel Cron can only invoke HTTP routes; the CLI scripts would
  need thin API-route wrappers (planned for v1.1) or an external runner.

On Vercel, every deployment also runs `prisma migrate deploy` plus one
incremental sync via the `vercel-build` script (sync failures never block the
deploy). That keeps schema current and data reasonably fresh between
scheduled runs — it complements, not replaces, a recurring schedule.

Monitor the `IngestionRun` table for FAILED rows.

## API key rotation

1. Generate a new key at https://app.pandascore.co (dashboard → API).
2. Replace `PANDASCORE_API_KEY` in `.env` (or the host's env settings).
3. Restart nothing: the key is read per ingestion run. Verify with
   `npm run ingest -- --list` (provider shows "configured") and a task run.
4. Revoke the old key in the PandaScore dashboard.

If a key was ever exposed (pasted in chat, logged, committed), rotate immediately.

## Database backup and restore

```bash
# backup (custom format, compressed)
pg_dump -Fc -d cssnipes -f cssnipes-$(date +%Y%m%d).dump

# restore into a fresh database
createdb cssnipes_restore
pg_restore -d cssnipes_restore --no-owner cssnipes-*.dump
```

All analytics tables are derived — after any restore, `npm run analytics`
rebuilds them from raw results. Only raw entities (teams, players, rosters,
events, matches, stats) and ingestion state are irreplaceable.

## Dependency updates

```bash
npm outdated
npm audit                    # known advisories
npm update <pkg>             # patch/minor
```

- Never run `npm audit fix --force` (it downgrades `next`).
- After `prisma`/`@prisma/client` updates: `npx prisma generate`, run tests.
- After `next` updates: read the bundled upgrade guide in
  `node_modules/next/dist/docs/` (this project tracks new Next.js majors).

## Common troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Pages 500 / API `internal_error` | Postgres down or bad `DATABASE_URL` | `brew services start postgresql@17` (local); check env |
| Ingestion `SKIPPED (not_configured)` | Missing `PANDASCORE_API_KEY` | Set it in `.env` |
| Ingestion `FAILED (blocked)` | 401/403/429 from PandaScore | Verify key validity; wait out rate limits (runner backs off automatically) |
| Ingestion warnings "missing team/event — skipped" | Referenced entity outside sync window | Harmless; future runs backfill as upstream records update |
| Empty rankings/model tables | Analytics never ran | `npm run analytics` |
| `EADDRINUSE` on start | Stale server holding the port | `lsof -tnP -iTCP:<port> -sTCP:LISTEN \| xargs kill` |
| Prisma "migration not found" drift | Local ledger out of sync | `npx prisma migrate status`, then resolve per its instructions |

## Log locations

- **Application**: stdout/stderr of the Next.js process (dev terminal, or the
  host's log drain in production). API 500s log as `[api] <error>`.
- **Ingestion**: CLI stdout per run *and* the `IngestionRun` table
  (persistent: status, counts, warnings JSON, error text, timestamps).
- **Analytics**: CLI stdout summary line.
- **Database**: `/opt/homebrew/var/log/postgresql@17.log` (local brew install).

## Recovery procedures

- **Bad/partial ingestion**: nothing to roll back — upserts are idempotent.
  Re-run the sync; if a provider shipped corrupt data, fix/delete the affected
  rows by `externalId` prefix and re-run.
- **Corrupted derived analytics**: `npm run analytics` (full deterministic rebuild).
- **Lost database**: restore latest dump → `npx prisma migrate deploy` →
  full ingest → `npm run analytics`.
- **Bad deploy**: redeploy the previous tag (`v0.1.0`); the database schema is
  backward-compatible within a minor version.

## Monitoring recommendations

- Alert on `IngestionRun.status = 'FAILED'` rows and on no successful run in
  > 2× the schedule interval (`lastSuccessAt` in `IngestionSyncState`).
- Uptime check on `/api/v1/cs2/matches?limit=1` (exercises app + DB).
- Postgres disk/connection metrics from the managed-DB provider.
- Track PandaScore quota usage in their dashboard if sync frequency increases.
