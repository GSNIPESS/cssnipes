import { handleApi, jsonOk } from "@/lib/api";
import { getTeamsOverview } from "@/lib/queries/teams";

export const dynamic = "force-dynamic";

export function GET() {
  return handleApi(async () => {
    const teams = await getTeamsOverview();
    return jsonOk(teams, { count: teams.length });
  });
}
