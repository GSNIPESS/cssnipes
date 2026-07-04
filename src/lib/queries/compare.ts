import { prisma } from "@/lib/prisma";
import { RankingSource, RatingSystem } from "@/generated/prisma/client";
import { getPlayerCareerTotals } from "@/lib/queries/players";
import { getTeamRecord } from "@/lib/queries/teams";

export async function getTeamComparison(slug: string) {
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      rankings: {
        where: { source: RankingSource.HLTV },
        orderBy: { date: "desc" },
        take: 1,
      },
      ratings: {
        where: { system: RatingSystem.ELO },
        orderBy: { date: "desc" },
        take: 1,
      },
      rosters: {
        where: { endDate: null },
        include: { player: { select: { slug: true, nickname: true } } },
      },
    },
  });
  if (!team) return null;

  const record = await getTeamRecord(team.id);
  return {
    slug: team.slug,
    name: team.name,
    country: team.country,
    rank: team.rankings[0]?.rank ?? null,
    elo: team.ratings[0]?.rating ?? null,
    roster: team.rosters.map((r) => r.player),
    record,
  };
}

export async function getPlayerComparison(slug: string) {
  const player = await prisma.player.findUnique({
    where: { slug },
    include: {
      rosters: {
        where: { endDate: null },
        include: { team: { select: { slug: true, name: true } } },
        take: 1,
      },
      rollingStats: { orderBy: { asOfDate: "desc" }, take: 1 },
    },
  });
  if (!player) return null;

  const career = await getPlayerCareerTotals(player.id);
  return {
    slug: player.slug,
    nickname: player.nickname,
    country: player.country,
    role: player.role,
    team: player.rosters[0]?.team ?? null,
    form: player.rollingStats[0] ?? null,
    career,
  };
}

/**
 * Dropdown options are capped to entities with an active roster link so the
 * selects stay usable at full-database scale. Any team/player still works via
 * the a/b slug URL params — the pickers are a convenience, not a limit.
 */
const OPTION_CAP = 500;

export function getCompareOptions() {
  return Promise.all([
    prisma.team.findMany({
      where: { disbanded: false, rosters: { some: { endDate: null } } },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
      take: OPTION_CAP,
    }),
    prisma.player.findMany({
      where: { isActive: true, rosters: { some: { endDate: null } } },
      select: { slug: true, nickname: true },
      orderBy: { nickname: "asc" },
      take: OPTION_CAP,
    }),
  ]);
}
