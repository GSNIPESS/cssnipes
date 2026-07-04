import { z } from "zod";
import { handleApi, jsonOk, limitParam, searchParamsOf } from "@/lib/api";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "@/lib/queries/matches";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  status: z.enum(["live", "upcoming", "completed"]).default("upcoming"),
  limit: limitParam,
});

export function GET(request: Request) {
  return handleApi(async () => {
    const params = searchParamsOf(request);
    const { status, limit } = paramsSchema.parse({
      status: params.get("status") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });

    const matches =
      status === "live"
        ? await getLiveMatches(limit)
        : status === "upcoming"
          ? await getUpcomingMatches(limit)
          : await getCompletedMatches(limit);

    return jsonOk(matches, { status, count: matches.length });
  });
}
