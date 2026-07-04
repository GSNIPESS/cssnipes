import type { PrismaClient } from "@/generated/prisma/client";
import type { IngestionProvider, SportModule } from "../core/types";
import { applyCs2Batch } from "./mapper";
import { LocalJsonProvider } from "./providers/local-json";
import { PandaScoreProvider } from "./providers/pandascore";
import { cs2RecordSchema, type Cs2Record } from "./schema";

const providers = new Map<string, IngestionProvider<Cs2Record>>();
for (const provider of [new PandaScoreProvider(), new LocalJsonProvider()]) {
  providers.set(provider.name, provider);
}

export const cs2Module: SportModule<Cs2Record> = {
  sport: "cs2",
  providers,
  async applyBatch(prisma: PrismaClient, records: unknown[]) {
    // Re-validate at the trust boundary: mappers only ever see canonical records.
    const validated = records.map((r) => cs2RecordSchema.parse(r));
    return applyCs2Batch(prisma, validated);
  },
};
