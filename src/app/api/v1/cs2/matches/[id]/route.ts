import { handleApi, jsonOk, notFound } from "@/lib/api";
import { getMatchDetail } from "@/lib/queries/matches";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApi(async () => {
    const { id } = await params;
    const match = await getMatchDetail(id);
    if (!match) return notFound("match");
    return jsonOk(match);
  });
}
