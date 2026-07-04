import type { PrismaClient } from "@/generated/prisma/client";
import type { UpsertCounts } from "../core/types";
import {
  slugify,
  type Cs2Event,
  type Cs2Match,
  type Cs2Player,
  type Cs2Record,
  type Cs2Team,
} from "./schema";

/**
 * Applies canonical CS2 records to the database with idempotent upserts keyed
 * by provider externalIds. Records are applied in dependency order (teams →
 * players → events → matches) regardless of input order, so a single batch
 * can carry a full snapshot.
 */
export async function applyCs2Batch(
  prisma: PrismaClient,
  records: Cs2Record[]
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { upserted: 0, skipped: 0, warnings: [] };

  const byKind = {
    team: [] as Cs2Team[],
    player: [] as Cs2Player[],
    event: [] as Cs2Event[],
    match: [] as Cs2Match[],
  };
  for (const record of records) byKind[record.kind].push(record as never);

  for (const team of byKind.team) await upsertTeam(prisma, team, counts);
  for (const player of byKind.player) await upsertPlayer(prisma, player, counts);
  for (const event of byKind.event) await upsertEvent(prisma, event, counts);
  for (const match of byKind.match) await upsertMatch(prisma, match, counts);

  return counts;
}

async function upsertTeam(prisma: PrismaClient, team: Cs2Team, counts: UpsertCounts) {
  const data = {
    name: team.name,
    country: team.country ?? undefined,
    logoUrl: team.logoUrl ?? undefined,
  };
  await prisma.team.upsert({
    where: { externalId: team.externalId },
    create: {
      externalId: team.externalId,
      slug: await uniqueSlug(team.slug ?? slugify(team.name), (slug) =>
        prisma.team.count({ where: { slug } })
      ),
      ...data,
    },
    update: data,
  });
  counts.upserted++;
}

async function upsertPlayer(prisma: PrismaClient, player: Cs2Player, counts: UpsertCounts) {
  const data = {
    nickname: player.nickname,
    firstName: player.firstName ?? undefined,
    lastName: player.lastName ?? undefined,
    country: player.country ?? undefined,
    role: player.role,
    birthdate: player.birthdate ?? undefined,
    isActive: player.isActive,
  };
  const saved = await prisma.player.upsert({
    where: { externalId: player.externalId },
    create: {
      externalId: player.externalId,
      slug: await uniqueSlug(player.slug ?? slugify(player.nickname), (slug) =>
        prisma.player.count({ where: { slug } })
      ),
      ...data,
    },
    update: data,
  });
  counts.upserted++;

  if (player.teamExternalId !== undefined) {
    await syncRoster(prisma, saved.id, player, counts);
  }
}

/** Closes/opens roster rows so membership history stays accurate. */
async function syncRoster(
  prisma: PrismaClient,
  playerId: string,
  player: Cs2Player,
  counts: UpsertCounts
) {
  const current = await prisma.roster.findFirst({
    where: { playerId, endDate: null },
    include: { team: { select: { externalId: true } } },
  });

  const targetTeam = player.teamExternalId
    ? await prisma.team.findUnique({ where: { externalId: player.teamExternalId } })
    : null;

  if (player.teamExternalId && !targetTeam) {
    counts.warnings.push(
      `player ${player.nickname}: team ${player.teamExternalId} not found — roster unchanged (ingest teams first)`
    );
    return;
  }

  const alreadyCorrect = current?.team.externalId === player.teamExternalId;
  if (alreadyCorrect || (!current && !targetTeam)) return;

  const now = new Date();
  if (current) {
    await prisma.roster.update({ where: { id: current.id }, data: { endDate: now } });
  }
  if (targetTeam) {
    await prisma.roster.create({
      data: {
        playerId,
        teamId: targetTeam.id,
        role: player.role ?? "RIFLER",
        startDate: now,
      },
    });
  }
}

async function upsertEvent(prisma: PrismaClient, event: Cs2Event, counts: UpsertCounts) {
  const data = {
    name: event.name,
    tier: event.tier,
    prizePool: event.prizePool ?? undefined,
    location: event.location ?? undefined,
    isLan: event.isLan,
    startDate: event.startDate,
    endDate: event.endDate ?? undefined,
  };
  await prisma.event.upsert({
    where: { externalId: event.externalId },
    create: {
      externalId: event.externalId,
      slug: await uniqueSlug(event.slug ?? slugify(event.name), (slug) =>
        prisma.event.count({ where: { slug } })
      ),
      ...data,
    },
    update: data,
  });
  counts.upserted++;
}

async function upsertMatch(prisma: PrismaClient, match: Cs2Match, counts: UpsertCounts) {
  const [event, teamA, teamB] = await Promise.all([
    prisma.event.findUnique({ where: { externalId: match.eventExternalId } }),
    prisma.team.findUnique({ where: { externalId: match.teamAExternalId } }),
    prisma.team.findUnique({ where: { externalId: match.teamBExternalId } }),
  ]);

  const missing = [
    !event && `event ${match.eventExternalId}`,
    !teamA && `team ${match.teamAExternalId}`,
    !teamB && `team ${match.teamBExternalId}`,
  ].filter(Boolean);
  if (!event || !teamA || !teamB) {
    counts.skipped++;
    counts.warnings.push(
      `match ${match.externalId}: missing ${missing.join(", ")} — skipped (ingest teams/events first)`
    );
    return;
  }

  const winnerId =
    match.winner === "A" ? teamA.id : match.winner === "B" ? teamB.id : null;

  const data = {
    eventId: event.id,
    teamAId: teamA.id,
    teamBId: teamB.id,
    bestOf: match.bestOf,
    stage: match.stage ?? undefined,
    status: match.status,
    scheduledAt: match.scheduledAt,
    startedAt: match.startedAt ?? undefined,
    endedAt: match.endedAt ?? undefined,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    winnerId,
  };

  const saved = await prisma.match.upsert({
    where: { externalId: match.externalId },
    create: { externalId: match.externalId, ...data },
    update: data,
  });
  counts.upserted++;

  for (const map of match.maps ?? []) {
    await upsertMatchMap(prisma, saved.id, teamA.id, teamB.id, match, map, counts);
  }
}

async function upsertMatchMap(
  prisma: PrismaClient,
  matchId: string,
  teamAId: string,
  teamBId: string,
  match: Cs2Match,
  map: NonNullable<Cs2Match["maps"]>[number],
  counts: UpsertCounts
) {
  const gameMap = await prisma.gameMap.upsert({
    where: { name: map.mapName },
    create: {
      name: map.mapName,
      displayName: displayNameFromMapName(map.mapName),
    },
    update: {},
  });

  const winnerId =
    map.winner === "A" ? teamAId : map.winner === "B" ? teamBId : null;
  const pickedByTeamId =
    map.pickedBy === "A" ? teamAId : map.pickedBy === "B" ? teamBId : null;

  const data = {
    mapId: gameMap.id,
    status: map.status,
    scoreA: map.scoreA,
    scoreB: map.scoreB,
    firstHalfA: map.firstHalfA,
    firstHalfB: map.firstHalfB,
    overtimeA: map.overtimeA,
    overtimeB: map.overtimeB,
    winnerId,
    pickedByTeamId,
  };

  const savedMap = await prisma.matchMap.upsert({
    where: { matchId_mapNumber: { matchId, mapNumber: map.mapNumber } },
    create: { matchId, mapNumber: map.mapNumber, ...data },
    update: data,
  });

  for (const stat of map.playerStats ?? []) {
    const [player, team] = await Promise.all([
      prisma.player.findUnique({ where: { externalId: stat.playerExternalId } }),
      prisma.team.findUnique({ where: { externalId: stat.teamExternalId } }),
    ]);
    if (!player || !team) {
      counts.skipped++;
      counts.warnings.push(
        `match ${match.externalId} map ${map.mapNumber}: unknown player/team for stat line — skipped`
      );
      continue;
    }
    const statData = {
      teamId: team.id,
      kills: stat.kills,
      deaths: stat.deaths,
      assists: stat.assists,
      headshots: stat.headshots,
      flashAssists: stat.flashAssists,
      firstKills: stat.firstKills,
      firstDeaths: stat.firstDeaths,
      clutchesWon: stat.clutchesWon,
      utilityDamage: stat.utilityDamage,
      adr: stat.adr,
      kast: stat.kast,
      rating: stat.rating,
    };
    await prisma.playerStat.upsert({
      where: {
        playerId_matchMapId: { playerId: player.id, matchMapId: savedMap.id },
      },
      create: { playerId: player.id, matchMapId: savedMap.id, ...statData },
      update: statData,
    });
  }
}

function displayNameFromMapName(name: string): string {
  const base = name.replace(/^de_/, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Appends a numeric suffix if the natural slug is taken by another record. */
async function uniqueSlug(
  base: string,
  countTaken: (slug: string) => Promise<number>
): Promise<string> {
  const slug = base || "unnamed";
  if ((await countTaken(slug)) === 0) return slug;
  for (let i = 2; ; i++) {
    const candidate = `${slug}-${i}`;
    if ((await countTaken(candidate)) === 0) return candidate;
  }
}
