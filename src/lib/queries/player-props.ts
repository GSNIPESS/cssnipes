import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";
import { getPlayerMatchHistory } from "@/lib/queries/props";
import {
  MIN_SAMPLES,
  projectPlayerProps,
  type PlayerPropsProjection,
  type PropsSample,
} from "@/analytics/player-props";

/**
 * Per-player kills/headshots projections for maps 1–2 of an upcoming match.
 * Each rostered player's last 10 recorded maps-1+2 stat lines feed the
 * Monte Carlo engine, opponent-adjusted by the other team's Elo. Returns a
 * scoresheet-shaped structure: two teams, each a list of players with a
 * projection (or null when the player lacks recorded map-level stats).
 */

export interface PlayerPropsRow {
  slug: string;
  nickname: string;
  role: string;
  projection: PlayerPropsProjection | null;
}

export interface TeamProps {
  slug: string;
  name: string;
  players: PlayerPropsRow[];
}

export interface MatchPlayerProps {
  available: boolean;
  reason: string;
  bestOf: number;
  propsMaps: number;
  teams: [TeamProps, TeamProps] | null;
}

async function teamElo(teamId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ rating: number }>>`
    SELECT rating FROM "TeamRating"
    WHERE "teamId" = ${teamId} AND system = 'ELO'
    ORDER BY date DESC LIMIT 1`;
  return rows[0]?.rating ?? null;
}

async function teamPlayerProps(
  teamId: string,
  opponentElo: number | null,
  seedPrefix: string
): Promise<PlayerPropsRow[]> {
  const roster = await prisma.roster.findMany({
    where: { teamId, endDate: null },
    include: { player: { select: { id: true, slug: true, nickname: true, role: true } } },
    orderBy: { startDate: "asc" },
  });

  return Promise.all(
    roster.map(async (r) => {
      const history = await getPlayerMatchHistory(r.player.id, 10);
      const samples: PropsSample[] = history
        .filter((h) => h.statsAvailable && h.kills !== null && h.headshots !== null)
        .map((h) => ({ kills: h.kills!, headshots: h.headshots! }));
      return {
        slug: r.player.slug,
        nickname: r.player.nickname,
        role: r.player.role,
        projection: projectPlayerProps(samples, opponentElo, {
          seed: `${seedPrefix}:${r.player.id}`,
        }),
      };
    })
  );
}

export async function getMatchPlayerProps(matchId: string): Promise<MatchPlayerProps> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      bestOf: true,
      status: true,
      teamA: { select: { id: true, slug: true, name: true } },
      teamB: { select: { id: true, slug: true, name: true } },
    },
  });

  const propsMaps = !match ? 0 : match.bestOf <= 1 ? 1 : 2;
  if (!match) {
    return { available: false, reason: "match not found", bestOf: 0, propsMaps, teams: null };
  }
  if (match.status === MatchStatus.COMPLETED || match.status === MatchStatus.CANCELLED) {
    return {
      available: false,
      reason: "Match already decided — projections are for upcoming/live matches.",
      bestOf: match.bestOf,
      propsMaps,
      teams: null,
    };
  }

  const [eloA, eloB] = await Promise.all([
    teamElo(match.teamA.id),
    teamElo(match.teamB.id),
  ]);
  const [playersA, playersB] = await Promise.all([
    teamPlayerProps(match.teamA.id, eloB, `${matchId}:A`),
    teamPlayerProps(match.teamB.id, eloA, `${matchId}:B`),
  ]);

  const teams: [TeamProps, TeamProps] = [
    { slug: match.teamA.slug, name: match.teamA.name, players: playersA },
    { slug: match.teamB.slug, name: match.teamB.name, players: playersB },
  ];
  const anyProjection = [...playersA, ...playersB].some((p) => p.projection);

  return {
    available: anyProjection,
    reason: anyProjection
      ? ""
      : `Per-player map statistics are not exposed by the current data provider plan, so there is no maps-1–2 kills/headshots history to project from (needs at least ${MIN_SAMPLES} recorded matches per player). This scoresheet populates automatically once map-level player stats are ingested.`,
    bestOf: match.bestOf,
    propsMaps,
    teams,
  };
}
