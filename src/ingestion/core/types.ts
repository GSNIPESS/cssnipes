import type { PrismaClient } from "@/generated/prisma/client";

/** Sports are added by registering a new SportModule — core never changes. */
export type SportId = "cs2" | "nhl" | "mlb";

export const INGESTION_TASKS = ["teams", "players", "events", "matches"] as const;
export type IngestionTask = (typeof INGESTION_TASKS)[number];

export type ProviderHealth =
  | "healthy"
  | "degraded" // partial data or recoverable errors
  | "blocked" // upstream rejected us (401/403/429 exhausted)
  | "not_configured" // missing credentials
  | "error"; // hard failure

/**
 * Every provider fetch resolves to this envelope — providers never throw for
 * upstream problems, so a bad source can never take down the pipeline.
 */
export interface FetchResult<TRecord> {
  ok: boolean;
  data: TRecord[];
  source: string;
  fetchedAt: string; // ISO timestamp
  warnings: string[];
  health: ProviderHealth;
  /** Opaque incremental-sync cursor to persist when the run succeeds. */
  nextCursor: string | null;
}

export interface FetchOptions {
  /** Cursor persisted from the previous successful run, if any. */
  cursor: string | null;
  /** Soft cap on records per run. */
  limit: number;
}

export interface IngestionProvider<TRecord> {
  readonly name: string;
  readonly sport: SportId;
  readonly tasks: readonly IngestionTask[];
  /** False means "connect later" (e.g. missing API key) — never an error. */
  isConfigured(): boolean;
  fetchTask(task: IngestionTask, opts: FetchOptions): Promise<FetchResult<TRecord>>;
}

export interface UpsertCounts {
  upserted: number;
  skipped: number;
  warnings: string[];
}

/**
 * One per sport. Adding NHL/MLB means implementing this interface in a new
 * src/ingestion/<sport>/ folder and registering it — nothing else changes.
 */
export interface SportModule<TRecord = unknown> {
  readonly sport: SportId;
  readonly providers: ReadonlyMap<string, IngestionProvider<TRecord>>;
  /** Idempotent: applying the same batch twice must be a no-op. */
  applyBatch(prisma: PrismaClient, records: TRecord[]): Promise<UpsertCounts>;
}

export interface RunSummary {
  sport: SportId;
  provider: string;
  task: IngestionTask;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  health: ProviderHealth;
  itemsFetched: number;
  itemsUpserted: number;
  warnings: string[];
  error: string | null;
  durationMs: number;
}
