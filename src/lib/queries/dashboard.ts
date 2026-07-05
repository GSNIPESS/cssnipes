import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";

/** Data for the landing dashboard — all from existing tables. */

export interface RatingMover {
  slug: string;
  name: string;
  now: number;
  before: number;
  delta: number;
}

/**
 * Biggest Elo movers over a window: latest rating vs rating as of
 * (now − days), teams with matches in both periods only.
 */
export async function getRatingMovers(days = 7, take = 5) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ slug: string; name: string; now: number; before: number }>
  >`
    SELECT t.slug, t.name, cur.rating AS now, past.rating AS before
    FROM "Team" t
    CROSS JOIN LATERAL (
      SELECT rating FROM "TeamRating" tr
      WHERE tr."teamId" = t.id AND tr.system = 'ELO'
      ORDER BY tr.date DESC LIMIT 1
    ) cur
    CROSS JOIN LATERAL (
      SELECT rating FROM "TeamRating" tr
      WHERE tr."teamId" = t.id AND tr.system = 'ELO' AND tr.date <= ${cutoff}
      ORDER BY tr.date DESC LIMIT 1
    ) past
    WHERE cur.rating <> past.rating`;

  const movers: RatingMover[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    now: r.now,
    before: r.before,
    delta: r.now - r.before,
  }));
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const risers = movers.filter((m) => m.delta > 0).slice(0, take);
  const fallers = movers.filter((m) => m.delta < 0).slice(0, take);
  return { risers, fallers, windowDays: days };
}

/** Most active teams by completed matches in the window. */
export async function getMostActiveTeams(days = 30, take = 5) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ slug: string; name: string; played: bigint; won: bigint }>
  >`
    SELECT t.slug, t.name, count(*) AS played,
           count(*) FILTER (WHERE m."winnerId" = t.id) AS won
    FROM "Team" t
    JOIN "Match" m ON (m."teamAId" = t.id OR m."teamBId" = t.id)
    WHERE m.status = 'COMPLETED' AND m."scheduledAt" >= ${cutoff}
    GROUP BY t.id ORDER BY count(*) DESC LIMIT ${take}`;
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    played: Number(r.played),
    won: Number(r.won),
  }));
}

export function getUpcomingEvents(take = 5) {
  return prisma.event.findMany({
    where: { startDate: { gt: new Date() } },
    orderBy: { startDate: "asc" },
    take,
    select: { slug: true, name: true, tier: true, startDate: true, isLan: true },
  });
}

export function getOngoingEvents(take = 5) {
  const now = new Date();
  return prisma.event.findMany({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    orderBy: { startDate: "desc" },
    take,
    select: { slug: true, name: true, tier: true, endDate: true },
  });
}

/** Featured match: next scheduled (or live) match between the highest-rated pair. */
export async function getFeaturedMatch() {
  const candidates = await prisma.match.findMany({
    where: {
      status: { in: [MatchStatus.LIVE, MatchStatus.SCHEDULED] },
      scheduledAt: { lte: new Date(Date.now() + 48 * 3600 * 1000) },
    },
    orderBy: { scheduledAt: "asc" },
    take: 60,
    include: {
      teamA: { select: { id: true, slug: true, name: true } },
      teamB: { select: { id: true, slug: true, name: true } },
      event: { select: { slug: true, name: true, tier: true } },
    },
  });
  if (!candidates.length) return null;

  const elo = new Map(
    (
      await prisma.$queryRaw<Array<{ teamId: string; rating: number }>>`
        SELECT t.id AS "teamId", x.rating
        FROM "Team" t
        CROSS JOIN LATERAL (
          SELECT rating FROM "TeamRating" tr
          WHERE tr."teamId" = t.id AND tr.system = 'ELO'
          ORDER BY tr.date DESC LIMIT 1
        ) x`
    ).map((r) => [r.teamId, r.rating])
  );

  const score = (m: (typeof candidates)[number]) =>
    (elo.get(m.teamA.id) ?? 1400) +
    (elo.get(m.teamB.id) ?? 1400) +
    (m.status === "LIVE" ? 200 : 0);
  return candidates.reduce((best, m) => (score(m) > score(best) ? m : best));
}

/** Freshness line for the footer of the dashboard. */
export async function getDatabaseStatus() {
  const [lastSync, counts] = await Promise.all([
    prisma.ingestionRun.findFirst({
      where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.$queryRaw<Array<{ teams: bigint; players: bigint; matches: bigint; events: bigint }>>`
      SELECT (SELECT count(*) FROM "Team") teams,
             (SELECT count(*) FROM "Player") players,
             (SELECT count(*) FROM "Match") matches,
             (SELECT count(*) FROM "Event") events`,
  ]);
  const c = counts[0];
  return {
    lastSyncAt: lastSync?.startedAt ?? null,
    teams: Number(c.teams),
    players: Number(c.players),
    matches: Number(c.matches),
    events: Number(c.events),
  };
}
