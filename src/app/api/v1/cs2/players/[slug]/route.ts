import { handleApi, jsonOk, notFound } from "@/lib/api";
import {
  getPlayerBySlug,
  getPlayerCareerTotals,
  getPlayerRecentStats,
} from "@/lib/queries/players";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleApi(async () => {
    const { slug } = await params;
    const player = await getPlayerBySlug(slug);
    if (!player) return notFound("player");

    const [career, recentStats] = await Promise.all([
      getPlayerCareerTotals(player.id),
      getPlayerRecentStats(player.id, 20),
    ]);
    return jsonOk({ ...player, career, recentStats });
  });
}
