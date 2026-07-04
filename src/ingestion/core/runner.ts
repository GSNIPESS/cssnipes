import type { PrismaClient } from "@/generated/prisma/client";
import type {
  IngestionTask,
  RunSummary,
  SportModule,
} from "./types";

const DEFAULT_LIMIT = 500;

/**
 * Executes one ingestion task: loads the sync cursor, fetches from the
 * provider, applies idempotent upserts, then persists the cursor and an
 * IngestionRun audit row. Upstream failures produce a FAILED/PARTIAL summary,
 * never an exception.
 */
export async function runIngestionTask<TRecord>(
  prisma: PrismaClient,
  module: SportModule<TRecord>,
  providerName: string,
  task: IngestionTask,
  { limit = DEFAULT_LIMIT }: { limit?: number } = {}
): Promise<RunSummary> {
  const startedAt = Date.now();
  const provider = module.providers.get(providerName);
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerName}" for sport "${module.sport}". ` +
        `Registered: ${[...module.providers.keys()].join(", ")}`
    );
  }
  if (!provider.tasks.includes(task)) {
    return skipped(module.sport, providerName, task, startedAt, [
      `provider does not support task "${task}"`,
    ]);
  }
  if (!provider.isConfigured()) {
    return {
      sport: module.sport,
      provider: providerName,
      task,
      status: "SKIPPED",
      health: "not_configured",
      itemsFetched: 0,
      itemsUpserted: 0,
      warnings: [`provider "${providerName}" is not configured — connect credentials to enable it`],
      error: null,
      durationMs: Date.now() - startedAt,
    };
  }

  const stateKey = { sport: module.sport, provider: providerName, task };
  const run = await prisma.ingestionRun.create({ data: stateKey });
  const state = await prisma.ingestionSyncState.findUnique({
    where: { sport_provider_task: stateKey },
  });

  const warnings: string[] = [];
  let status: RunSummary["status"] = "FAILED";
  let health: RunSummary["health"] = "error";
  let itemsFetched = 0;
  let itemsUpserted = 0;
  let error: string | null = null;

  try {
    const result = await provider.fetchTask(task, {
      cursor: state?.cursor ?? null,
      limit,
    });
    warnings.push(...result.warnings);
    health = result.health;
    itemsFetched = result.data.length;

    if (!result.ok) {
      error = `provider unhealthy (${result.health})`;
      status = "FAILED";
    } else {
      const counts = await module.applyBatch(prisma, result.data);
      itemsUpserted = counts.upserted;
      warnings.push(...counts.warnings);
      status = counts.warnings.length > 0 || result.health === "degraded" ? "PARTIAL" : "SUCCEEDED";

      await prisma.ingestionSyncState.upsert({
        where: { sport_provider_task: stateKey },
        create: {
          ...stateKey,
          cursor: result.nextCursor,
          lastSuccessAt: new Date(),
        },
        update: {
          cursor: result.nextCursor ?? state?.cursor ?? null,
          lastSuccessAt: new Date(),
        },
      });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = "FAILED";
  }

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      itemsFetched,
      itemsUpserted,
      warnings: warnings.length ? warnings : undefined,
      error,
    },
  });

  return {
    sport: module.sport,
    provider: providerName,
    task,
    status,
    health,
    itemsFetched,
    itemsUpserted,
    warnings,
    error,
    durationMs: Date.now() - startedAt,
  };
}

function skipped(
  sport: RunSummary["sport"],
  provider: string,
  task: IngestionTask,
  startedAt: number,
  warnings: string[]
): RunSummary {
  return {
    sport,
    provider,
    task,
    status: "SKIPPED",
    health: "healthy",
    itemsFetched: 0,
    itemsUpserted: 0,
    warnings,
    error: null,
    durationMs: Date.now() - startedAt,
  };
}
