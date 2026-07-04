import { handleApi, jsonOk, parsePageParams } from "@/lib/api";
import { getPlayersOverview } from "@/lib/queries/players";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApi(async () => {
    const { limit, offset } = parsePageParams(request);
    const players = await getPlayersOverview();
    const page = players.slice(offset, offset + limit);
    return jsonOk(page, { count: page.length, total: players.length, limit, offset });
  });
}
