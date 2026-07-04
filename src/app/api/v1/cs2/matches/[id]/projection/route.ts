import { handleApi, jsonOk, notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { projectMatch } from "@/analytics/projection";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApi(async () => {
    const { id } = await params;
    const projection = await projectMatch(prisma, id);
    if (!projection.available && projection.reason === "match not found") {
      return notFound("match");
    }
    return jsonOk(projection);
  });
}
