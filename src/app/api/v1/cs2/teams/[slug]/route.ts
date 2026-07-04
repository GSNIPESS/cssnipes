import { handleApi, jsonOk, notFound } from "@/lib/api";
import { getTeamRecentMatches } from "@/lib/queries/matches";
import { getTeamBySlug, getTeamRecord } from "@/lib/queries/teams";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleApi(async () => {
    const { slug } = await params;
    const team = await getTeamBySlug(slug);
    if (!team) return notFound("team");

    const [record, recentMatches] = await Promise.all([
      getTeamRecord(team.id),
      getTeamRecentMatches(team.id, 10),
    ]);
    return jsonOk({ ...team, record, recentMatches });
  });
}
