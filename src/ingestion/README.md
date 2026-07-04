# Ingestion pipeline

Sport-agnostic data ingestion. The core (`core/`) knows nothing about any
sport; each sport contributes a self-contained module.

## Layout

```
core/       Provider interface, result envelope, HTTP client (rate limiting,
            retries, blocked-state detection), runner (cursors + audit log),
            sport registry.
cs2/        CS2 module: canonical zod schemas, idempotent Prisma mapper,
            providers (pandascore, local-json).
index.ts    Registers sport modules.
```

## Running

```bash
npm run ingest -- --list                                      # what's registered
npm run ingest -- --sport cs2 --provider local-json           # all tasks
npm run ingest -- --sport cs2 --provider pandascore --task matches
```

Tasks run in dependency order (`teams → players → events → matches`) so
cross-references resolve. Records referencing missing entities are skipped
with warnings, never crash the run.

## Guarantees

- **Idempotent**: every upsert is keyed by provider `externalId`; re-running a
  batch is a no-op.
- **Incremental**: `IngestionSyncState` persists an opaque cursor per
  (sport, provider, task); providers only fetch what changed.
- **Audited**: every run writes an `IngestionRun` row (counts, warnings, errors).
- **Contained failures**: providers return a result envelope
  (`ok/data/source/fetchedAt/warnings/health`) instead of throwing; a blocked
  or misconfigured source degrades that run only.

## Providers

- `pandascore` — official PandaScore API. Set `PANDASCORE_API_KEY` in `.env`
  to activate; until then it reports `not_configured` and is skipped.
- `local-json` — imports canonical-schema JSON files from `data/imports/cs2/`
  (override with `CS2_IMPORT_DIR`). Used for manual backfills and fixtures.

## Adding a sport (NHL, MLB, …)

1. Create `src/ingestion/<sport>/` with canonical zod schemas, a mapper that
   upserts into that sport's tables, and one or more providers implementing
   `IngestionProvider` from `core/types.ts`.
2. Export a `SportModule` and register it in `src/ingestion/index.ts`.

Nothing in `core/` or existing sports changes.
