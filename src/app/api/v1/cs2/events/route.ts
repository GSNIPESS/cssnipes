import { z } from "zod";
import { handleApi, jsonOk, limitParam, searchParamsOf } from "@/lib/api";
import { getEvents } from "@/lib/queries/events";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ limit: limitParam });

export function GET(request: Request) {
  return handleApi(async () => {
    const { limit } = paramsSchema.parse({
      limit: searchParamsOf(request).get("limit") ?? undefined,
    });
    const events = await getEvents(limit);
    return jsonOk(events, { count: events.length });
  });
}
