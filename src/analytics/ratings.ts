import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { MatchStatus, RatingSystem } from "@/generated/prisma/client";
import { ELO_INITIAL, eloUpdate } from "./elo";
import { glickoDefault, glickoUpdate, type GlickoState } from "./glicko2";
import { trueSkillDefault, trueSkillUpdate, type TrueSkillState } from "./trueskill";

/**
 * Rebuilds TeamRating history for all three systems by replaying every
 * completed match in chronological order. Deterministic and idempotent:
 * derived rows are wiped and recomputed from raw results.
 */
export async function recomputeTeamRatings(prisma: PrismaClient): Promise<{
  matchesProcessed: number;
  ratingRows: number;
}> {
  const matches = await prisma.match.findMany({
    where: { status: MatchStatus.COMPLETED, winnerId: { not: null } },
    select: {
      teamAId: true,
      teamBId: true,
      winnerId: true,
      scoreA: true,
      scoreB: true,
      endedAt: true,
      scheduledAt: true,
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
  });

  const elo = new Map<string, number>();
  const glicko = new Map<string, GlickoState>();
  const trueskill = new Map<string, TrueSkillState>();
  const rows: Prisma.TeamRatingCreateManyInput[] = [];

  for (const match of matches) {
    const winnerId = match.winnerId!;
    const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
    const winnerMaps = winnerId === match.teamAId ? match.scoreA : match.scoreB;
    const loserMaps = winnerId === match.teamAId ? match.scoreB : match.scoreA;
    const date = match.endedAt ?? match.scheduledAt;

    // Elo
    const eloResult = eloUpdate(
      elo.get(winnerId) ?? ELO_INITIAL,
      elo.get(loserId) ?? ELO_INITIAL,
      winnerMaps,
      loserMaps
    );
    elo.set(winnerId, eloResult.winner);
    elo.set(loserId, eloResult.loser);
    rows.push(
      { teamId: winnerId, system: RatingSystem.ELO, rating: eloResult.winner, date },
      { teamId: loserId, system: RatingSystem.ELO, rating: eloResult.loser, date }
    );

    // Glicko-2 (both sides updated against pre-match states)
    const gWinner = glicko.get(winnerId) ?? glickoDefault();
    const gLoser = glicko.get(loserId) ?? glickoDefault();
    const gWinnerNext = glickoUpdate(gWinner, gLoser, 1);
    const gLoserNext = glickoUpdate(gLoser, gWinner, 0);
    glicko.set(winnerId, gWinnerNext);
    glicko.set(loserId, gLoserNext);
    rows.push(
      {
        teamId: winnerId,
        system: RatingSystem.GLICKO,
        rating: gWinnerNext.rating,
        deviation: gWinnerNext.rd,
        volatility: gWinnerNext.vol,
        date,
      },
      {
        teamId: loserId,
        system: RatingSystem.GLICKO,
        rating: gLoserNext.rating,
        deviation: gLoserNext.rd,
        volatility: gLoserNext.vol,
        date,
      }
    );

    // TrueSkill
    const ts = trueSkillUpdate(
      trueskill.get(winnerId) ?? trueSkillDefault(),
      trueskill.get(loserId) ?? trueSkillDefault()
    );
    trueskill.set(winnerId, ts.winner);
    trueskill.set(loserId, ts.loser);
    rows.push(
      {
        teamId: winnerId,
        system: RatingSystem.TRUESKILL,
        rating: ts.winner.mu,
        deviation: ts.winner.sigma,
        date,
      },
      {
        teamId: loserId,
        system: RatingSystem.TRUESKILL,
        rating: ts.loser.mu,
        deviation: ts.loser.sigma,
        date,
      }
    );
  }

  // Chunked rebuild: at full history this is hundreds of thousands of rows.
  const CHUNK = 10_000;
  await prisma.teamRating.deleteMany({});
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.teamRating.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
  }

  return { matchesProcessed: matches.length, ratingRows: rows.length };
}
