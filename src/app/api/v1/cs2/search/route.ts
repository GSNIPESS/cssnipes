import { z } from "zod";
import { handleApi, jsonOk, searchParamsOf } from "@/lib/api";
import { searchAll } from "@/lib/queries/search";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ q: z.string().min(1).max(100) });

export function GET(request: Request) {
  return handleApi(async () => {
    const { q } = paramsSchema.parse({
      q: searchParamsOf(request).get("q") ?? undefined,
    });
    const results = await searchAll(q);
    return jsonOk(results, {
      query: q,
      count: results.players.length + results.teams.length + results.events.length,
    });
  });
}
