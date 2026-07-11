import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/generated/prisma/client";
import { eloExpectedScore } from "@/analytics/elo";

/**
 * Research report for a COMPLETED match — "what mattered", computed entirely
 * from stored history as it stood when the match was played:
 *
 * - expected vs actual (pre-match Elo win probability vs the result)
 * - upset rating (100 × (1 − p_winner))
 * - rating movement (last rating before → first rating after, per team)
 * - head-to-head record entering the match
 * - form entering the match (last 10 completed results before it)
 * - generated takeaways referencing only the numbers above
 */

interface TeamSide {
  id: string;
  slug: string;
  name: string;
  eloBefore: number | null;
  eloAfter: number | null;
  formEntering: { played: number; won: number };
}

export interface MatchResearchReport {
  available: boolean;
  reason?: string;
  expectedA: number | null; // pre-match P(A wins) from Elo
  upsetRating: number | null; // 0–100
  underdogWon: boolean | null;
  h2hEntering: { meetings: number; winsA: number; winsB: number };
  teamA: TeamSide | null;
  teamB: TeamSide | null;
  takeaways: string[];
}

async function eloAsOf(teamId: string, before: Date): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ rating: number }>>`
    SELECT rating FROM "TeamRating"
    WHERE "teamId" = ${teamId} AND system = 'ELO' AND date < ${before}
    ORDER BY date DESC LIMIT 1`;
  return rows[0]?.rating ?? null;
}

async function eloFirstAfter(teamId: string, from: Date): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ rating: number }>>`
    SELECT rating FROM "TeamRating"
    WHERE "teamId" = ${teamId} AND system = 'ELO' AND date >= ${from}
    ORDER BY date ASC LIMIT 1`;
  return rows[0]?.rating ?? null;
}

async function formEntering(teamId: string, before: Date) {
  const rows = await prisma.match.findMany({
    where: {
      status: MatchStatus.COMPLETED,
      winnerId: { not: null },
      scheduledAt: { lt: before },
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    orderBy: { scheduledAt: "desc" },
    take: 10,
    select: { winnerId: true },
  });
  return {
    played: rows.length,
    won: rows.filter((r) => r.winnerId === teamId).length,
  };
}

export async function getMatchResearchReport(
  matchId: string
): Promise<MatchResearchReport> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      scheduledAt: true,
      winnerId: true,
      scoreA: true,
      scoreB: true,
      teamA: { select: { id: true, slug: true, name: true } },
      teamB: { select: { id: true, slug: true, name: true } },
    },
  });

  const empty = {
    expectedA: null,
    upsetRating: null,
    underdogWon: null,
    h2hEntering: { meetings: 0, winsA: 0, winsB: 0 },
    teamA: null,
    teamB: null,
    takeaways: [],
  };
  if (!match) return { available: false, reason: "match not found", ...empty };
  if (match.status !== MatchStatus.COMPLETED || !match.winnerId) {
    return { available: false, reason: "match not completed", ...empty };
  }

  const when = match.scheduledAt;
  const [beforeA, beforeB, afterA, afterB, formA, formB, priorMeetings] =
    await Promise.all([
      eloAsOf(match.teamA.id, when),
      eloAsOf(match.teamB.id, when),
      eloFirstAfter(match.teamA.id, when),
      eloFirstAfter(match.teamB.id, when),
      formEntering(match.teamA.id, when),
      formEntering(match.teamB.id, when),
      prisma.match.findMany({
        where: {
          status: MatchStatus.COMPLETED,
          scheduledAt: { lt: when },
          OR: [
            { teamAId: match.teamA.id, teamBId: match.teamB.id },
            { teamAId: match.teamB.id, teamBId: match.teamA.id },
          ],
        },
        select: { winnerId: true },
      }),
    ]);

  const expectedA =
    beforeA !== null && beforeB !== null
      ? eloExpectedScore(beforeA, beforeB)
      : null;
  const aWon = match.winnerId === match.teamA.id;
  const pWinner =
    expectedA === null ? null : aWon ? expectedA : 1 - expectedA;
  const upsetRating = pWinner === null ? null : Math.round(100 * (1 - pWinner));
  const underdogWon = pWinner === null ? null : pWinner < 0.5;

  const h2hEntering = {
    meetings: priorMeetings.length,
    winsA: priorMeetings.filter((m) => m.winnerId === match.teamA.id).length,
    winsB: priorMeetings.filter((m) => m.winnerId === match.teamB.id).length,
  };

  const winner = aWon ? match.teamA : match.teamB;
  const loser = aWon ? match.teamB : match.teamA;
  const takeaways: string[] = [];
  if (pWinner !== null) {
    takeaways.push(
      underdogWon
        ? `Upset: ${winner.name} won as a ${Math.round(pWinner * 100)}% pre-match underdog over ${loser.name}.`
        : `${winner.name} converted as the ${Math.round(pWinner * 100)}% pre-match favorite.`
    );
  }
  const winnerBefore = aWon ? beforeA : beforeB;
  const winnerAfter = aWon ? afterA : afterB;
  if (winnerBefore !== null && winnerAfter !== null) {
    const delta = winnerAfter - winnerBefore;
    takeaways.push(
      `${winner.name} moved ${delta >= 0 ? "+" : ""}${Math.round(delta)} Elo on the result (${Math.round(winnerBefore)} → ${Math.round(winnerAfter)}).`
    );
  }
  if (h2hEntering.meetings > 0) {
    takeaways.push(
      `Head-to-head entering the match: ${h2hEntering.winsA}–${h2hEntering.winsB} across ${h2hEntering.meetings} prior meeting${h2hEntering.meetings === 1 ? "" : "s"}.`
    );
  }
  const winnerForm = aWon ? formA : formB;
  if (winnerForm.played >= 5 && winnerForm.won / winnerForm.played <= 0.4) {
    takeaways.push(
      `${winner.name} won despite entering on poor form (${winnerForm.won} of ${winnerForm.played}).`
    );
  }

  return {
    available: true,
    expectedA,
    upsetRating,
    underdogWon,
    h2hEntering,
    teamA: {
      ...match.teamA,
      eloBefore: beforeA,
      eloAfter: afterA,
      formEntering: formA,
    },
    teamB: {
      ...match.teamB,
      eloBefore: beforeB,
      eloAfter: afterB,
      formEntering: formB,
    },
    takeaways,
  };
}
