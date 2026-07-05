import { z } from "zod";
import { handleApi, jsonOk, searchParamsOf } from "@/lib/api";
import { getLatestRankings, getLatestTeamRatings } from "@/lib/queries/rankings";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  source: z.enum(["hltv", "valve", "elo", "glicko", "trueskill"]).default("hltv"),
  /** Historical snapshot: ratings as of end of this date. */
  date: z.coerce.date().optional(),
});

const RANKING_SOURCES: Partial<Record<string, RankingSource>> = {
  hltv: RankingSource.HLTV,
  valve: RankingSource.VALVE,
};

const RATING_SYSTEMS: Partial<Record<string, RatingSystem>> = {
  elo: RatingSystem.ELO,
  glicko: RatingSystem.GLICKO,
  trueskill: RatingSystem.TRUESKILL,
};

export function GET(request: Request) {
  return handleApi(async () => {
    const params = searchParamsOf(request);
    const { source, date } = paramsSchema.parse({
      source: params.get("source") ?? undefined,
      date: params.get("date") ?? undefined,
    });

    const rankingSource = RANKING_SOURCES[source];
    const result = rankingSource
      ? await getLatestRankings(rankingSource)
      : await getLatestTeamRatings(RATING_SYSTEMS[source]!, date);

    return jsonOk(result.rows, {
      source,
      asOf: result.date,
      snapshotDate: date ?? null,
      count: result.rows.length,
    });
  });
}
