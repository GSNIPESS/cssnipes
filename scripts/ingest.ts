import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  getSportModule,
  INGESTION_TASKS,
  listSports,
  runIngestionTask,
  type IngestionTask,
  type RunSummary,
} from "../src/ingestion";

const USAGE = `Usage:
  npm run ingest -- --sport cs2 --provider local-json [--task matches] [--limit 500]
  npm run ingest -- --list

Options:
  --sport     Sport module to run (required unless --list)
  --provider  Provider name registered for that sport (required unless --list)
  --task      One of: ${INGESTION_TASKS.join(", ")}. Omit to run all in dependency order.
  --limit     Soft cap on records per task (default 500)
  --list      Show registered sports, providers, and their configuration state
`;

async function main() {
  const { values } = parseArgs({
    options: {
      sport: { type: "string" },
      provider: { type: "string" },
      task: { type: "string" },
      limit: { type: "string" },
      list: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  if (values.list) {
    for (const sport of listSports()) {
      console.log(`sport: ${sport.sport}`);
      for (const provider of sport.providers.values()) {
        const state = provider.isConfigured() ? "configured" : "not configured";
        console.log(`  - ${provider.name} (${state}) tasks: ${provider.tasks.join(", ")}`);
      }
    }
    return;
  }

  if (!values.sport || !values.provider) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const tasks: IngestionTask[] = values.task
    ? [validateTask(values.task)]
    : [...INGESTION_TASKS]; // dependency order: teams → players → events → matches

  const limit = values.limit ? Number(values.limit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer, got "${values.limit}"`);
  }

  const sportModule = getSportModule(values.sport);
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let failed = false;
  try {
    for (const task of tasks) {
      const summary = await runIngestionTask(prisma, sportModule, values.provider, task, {
        limit,
      });
      printSummary(summary);
      if (summary.status === "FAILED") failed = true;
    }
  } finally {
    await prisma.$disconnect();
  }

  if (failed) process.exitCode = 1;
}

function validateTask(task: string): IngestionTask {
  if ((INGESTION_TASKS as readonly string[]).includes(task)) {
    return task as IngestionTask;
  }
  throw new Error(`Unknown task "${task}". Valid tasks: ${INGESTION_TASKS.join(", ")}`);
}

function printSummary(s: RunSummary) {
  const icon =
    s.status === "SUCCEEDED"
      ? "✓"
      : s.status === "PARTIAL"
        ? "◐"
        : s.status === "SKIPPED"
          ? "→"
          : "✗";
  console.log(
    `${icon} [${s.sport}/${s.provider}] ${s.task}: ${s.status} ` +
      `(health=${s.health}, fetched=${s.itemsFetched}, upserted=${s.itemsUpserted}, ${s.durationMs}ms)`
  );
  for (const warning of s.warnings) console.log(`    warn: ${warning}`);
  if (s.error) console.log(`    error: ${s.error}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
