import { handleApi, jsonOk, parsePageParams } from "@/lib/api";
import { getTeamsOverview } from "@/lib/queries/teams";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApi(async () => {
    const { limit, offset } = parsePageParams(request);
    const teams = await getTeamsOverview();
    const page = teams.slice(offset, offset + limit);
    return jsonOk(page, { count: page.length, total: teams.length, limit, offset });
  });
}
