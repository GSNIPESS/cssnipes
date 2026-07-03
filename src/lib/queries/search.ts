import { prisma } from "@/lib/prisma";

export async function searchAll(query: string) {
  const q = query.trim();
  if (!q) return { players: [], teams: [], events: [] };

  const contains = { contains: q, mode: "insensitive" as const };

  const [players, teams, events] = await Promise.all([
    prisma.player.findMany({
      where: {
        OR: [{ nickname: contains }, { firstName: contains }, { lastName: contains }],
      },
      include: {
        rosters: {
          where: { endDate: null },
          include: { team: { select: { slug: true, name: true } } },
          take: 1,
        },
      },
      take: 20,
    }),
    prisma.team.findMany({ where: { name: contains }, take: 20 }),
    prisma.event.findMany({ where: { name: contains }, take: 20 }),
  ]);

  return { players, teams, events };
}
