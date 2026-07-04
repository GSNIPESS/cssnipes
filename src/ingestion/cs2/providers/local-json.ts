import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  FetchOptions,
  FetchResult,
  IngestionProvider,
  IngestionTask,
} from "../../core/types";
import { cs2RecordSchema, type Cs2Record } from "../schema";

/**
 * Imports canonical CS2 records from JSON files — the ingestion path for
 * manual backfills, exports from other systems, or fixtures during
 * development. Files live in data/imports/cs2/ (configurable via
 * CS2_IMPORT_DIR) and contain either a single record or an array of records
 * in the canonical schema (see src/ingestion/cs2/schema.ts).
 *
 * Invalid records are reported as warnings and skipped; one bad file never
 * aborts the batch.
 */
export class LocalJsonProvider implements IngestionProvider<Cs2Record> {
  readonly name = "local-json";
  readonly sport = "cs2" as const;
  readonly tasks = ["teams", "players", "events", "matches"] as const;

  private get dir(): string {
    return (
      process.env.CS2_IMPORT_DIR ?? path.join(process.cwd(), "data", "imports", "cs2")
    );
  }

  isConfigured(): boolean {
    return true; // reads local files; an empty/missing dir is just an empty batch
  }

  async fetchTask(
    task: IngestionTask,
    { limit }: FetchOptions
  ): Promise<FetchResult<Cs2Record>> {
    const fetchedAt = new Date().toISOString();
    const warnings: string[] = [];
    const records: Cs2Record[] = [];

    let files: string[];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith(".json")).sort();
    } catch {
      return {
        ok: true,
        data: [],
        source: this.name,
        fetchedAt,
        warnings: [`import directory ${this.dir} does not exist — nothing to import`],
        health: "healthy",
        nextCursor: null,
      };
    }

    const kindForTask: Record<IngestionTask, Cs2Record["kind"]> = {
      teams: "team",
      players: "player",
      events: "event",
      matches: "match",
    };

    for (const file of files) {
      const filePath = path.join(this.dir, file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(filePath, "utf8"));
      } catch (err) {
        warnings.push(`${file}: unreadable JSON (${err instanceof Error ? err.message : err})`);
        continue;
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const [index, item] of items.entries()) {
        const result = cs2RecordSchema.safeParse(item);
        if (!result.success) {
          warnings.push(`${file}[${index}]: ${z.prettifyError(result.error).slice(0, 200)}`);
          continue;
        }
        if (result.data.kind !== kindForTask[task]) continue;
        records.push(result.data);
        if (records.length >= limit) break;
      }
      if (records.length >= limit) break;
    }

    return {
      ok: true,
      data: records,
      source: this.name,
      fetchedAt,
      warnings,
      health: warnings.length ? "degraded" : "healthy",
      nextCursor: null, // file imports are always full re-reads; upserts keep it idempotent
    };
  }
}
