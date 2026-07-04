import { handleApi, jsonOk } from "@/lib/api";
import { getPlayersOverview } from "@/lib/queries/players";

export const dynamic = "force-dynamic";

export function GET() {
  return handleApi(async () => {
    const players = await getPlayersOverview();
    return jsonOk(players, { count: players.length });
  });
}
