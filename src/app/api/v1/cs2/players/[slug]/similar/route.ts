import { handleApi, jsonOk, notFound } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSimilarPlayers } from "@/analytics";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleApi(async () => {
    const { slug } = await params;
    const player = await prisma.player.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!player) return notFound("player");

    const similar = await getSimilarPlayers(prisma, player.id);
    return jsonOk(similar, { count: similar.length });
  });
}
