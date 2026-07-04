import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { recomputeAnalytics } from "../src/analytics";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    console.log("Recomputing analytics (Elo, Glicko-2, TrueSkill, rolling stats, map strengths)...");
    const summary = await recomputeAnalytics(prisma);
    console.log(
      `✓ ${summary.matchesProcessed} matches → ${summary.ratingRows} rating rows, ` +
        `${summary.rollingStatRows} rolling-stat rows, ${summary.mapStrengthRows} map-strength rows`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
