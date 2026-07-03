import { prisma } from "@/lib/prisma";

export function getEvents(take = 50) {
  return prisma.event.findMany({
    include: { _count: { select: { matches: true } } },
    orderBy: { startDate: "desc" },
    take,
  });
}

export function getEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: {
      matches: {
        include: {
          teamA: { select: { slug: true, name: true } },
          teamB: { select: { slug: true, name: true } },
          event: { select: { slug: true, name: true, tier: true } },
        },
        orderBy: { scheduledAt: "asc" },
      },
    },
  });
}
