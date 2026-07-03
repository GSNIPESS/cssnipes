import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  PlayerRole,
  EventTier,
  MatchStatus,
  MapStatus,
  RankingSource,
  RatingSystem,
  TransferType,
  SnapshotEntity,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ROLES: PlayerRole[] = [
  PlayerRole.IGL,
  PlayerRole.AWPER,
  PlayerRole.RIFLER,
  PlayerRole.SUPPORT,
  PlayerRole.LURKER,
];

const TEAMS = [
  { slug: "natus-vincere", name: "Natus Vincere", country: "UA" },
  { slug: "team-vitality", name: "Team Vitality", country: "FR" },
  { slug: "team-spirit", name: "Team Spirit", country: "RU" },
  { slug: "faze-clan", name: "FaZe Clan", country: "EU" },
  { slug: "g2-esports", name: "G2 Esports", country: "EU" },
];

const PLAYERS: Record<string, string[]> = {
  "natus-vincere": ["aleksib", "im", "b1t", "jl", "w0nderful"],
  "team-vitality": ["apex", "flamez", "zywoo", "mezii", "ropz"],
  "team-spirit": ["chopper", "sh1ro", "donk", "zont1x", "zweih"],
  "faze-clan": ["karrigan", "rain", "frozen", "broky", "jcobbb"],
  "g2-esports": ["snax", "huntr", "malbsmd", "matys", "hexa"],
};

const MAPS = [
  { name: "de_mirage", displayName: "Mirage" },
  { name: "de_inferno", displayName: "Inferno" },
  { name: "de_nuke", displayName: "Nuke" },
  { name: "de_ancient", displayName: "Ancient" },
  { name: "de_anubis", displayName: "Anubis" },
  { name: "de_dust2", displayName: "Dust II" },
  { name: "de_train", displayName: "Train" },
];

// Deterministic pseudo-random so reseeding produces identical data.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

async function main() {
  console.log("Seeding cssnipes database...");

  // Idempotent reseed: wipe leaf tables first (cascades handle the rest).
  await prisma.historicalSnapshot.deleteMany();
  await prisma.playerRollingStat.deleteMany();
  await prisma.teamMapStrength.deleteMany();
  await prisma.teamRating.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.ranking.deleteMany();
  await prisma.playerStat.deleteMany();
  await prisma.matchMap.deleteMany();
  await prisma.match.deleteMany();
  await prisma.event.deleteMany();
  await prisma.roster.deleteMany();
  await prisma.player.deleteMany();
  await prisma.gameMap.deleteMany();
  await prisma.team.deleteMany();
  await prisma.patch.deleteMany();

  const maps = await Promise.all(
    MAPS.map((m) =>
      prisma.gameMap.create({
        data: { ...m, isActiveDuty: m.name !== "de_dust2" },
      })
    )
  );

  const teams: Record<string, { id: string }> = {};
  const playersByTeam: Record<string, { id: string }[]> = {};

  for (const t of TEAMS) {
    const team = await prisma.team.create({ data: t });
    teams[t.slug] = team;
    playersByTeam[t.slug] = [];

    for (const [i, nickname] of PLAYERS[t.slug].entries()) {
      const player = await prisma.player.create({
        data: {
          slug: nickname,
          nickname,
          country: t.country === "EU" ? "EU" : t.country,
          role: ROLES[i],
        },
      });
      playersByTeam[t.slug].push(player);
      await prisma.roster.create({
        data: {
          teamId: team.id,
          playerId: player.id,
          role: ROLES[i],
          startDate: new Date("2025-01-10"),
        },
      });
    }
  }

  const event = await prisma.event.create({
    data: {
      slug: "iem-cologne-2026",
      name: "IEM Cologne 2026",
      tier: EventTier.S,
      prizePool: 1_000_000,
      location: "Cologne, Germany",
      isLan: true,
      startDate: new Date("2026-06-25"),
      endDate: new Date("2026-07-05"),
    },
  });

  // Two completed BO3s + one upcoming match.
  const fixtures = [
    {
      a: "natus-vincere",
      b: "faze-clan",
      status: MatchStatus.COMPLETED,
      scheduledAt: new Date("2026-06-28T14:00:00Z"),
      stage: "Quarter-final",
    },
    {
      a: "team-vitality",
      b: "team-spirit",
      status: MatchStatus.COMPLETED,
      scheduledAt: new Date("2026-06-29T17:00:00Z"),
      stage: "Quarter-final",
    },
    {
      a: "natus-vincere",
      b: "team-vitality",
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date("2026-07-04T17:00:00Z"),
      stage: "Semi-final",
    },
  ];

  for (const [fi, f] of fixtures.entries()) {
    const teamA = teams[f.a];
    const teamB = teams[f.b];
    const completed = f.status === MatchStatus.COMPLETED;
    const aWinsMatch = rand() > 0.5;

    const match = await prisma.match.create({
      data: {
        externalId: `seed-match-${fi + 1}`,
        eventId: event.id,
        teamAId: teamA.id,
        teamBId: teamB.id,
        bestOf: 3,
        stage: f.stage,
        status: f.status,
        scheduledAt: f.scheduledAt,
        startedAt: completed ? f.scheduledAt : null,
        endedAt: completed
          ? new Date(f.scheduledAt.getTime() + 2.5 * 3600_000)
          : null,
        scoreA: completed ? (aWinsMatch ? 2 : 1) : 0,
        scoreB: completed ? (aWinsMatch ? 1 : 2) : 0,
        winnerId: completed ? (aWinsMatch ? teamA.id : teamB.id) : null,
      },
    });

    if (!completed) continue;

    // 3 maps, loser takes map 2.
    for (let mapNumber = 1; mapNumber <= 3; mapNumber++) {
      const aWinsMap = mapNumber === 2 ? !aWinsMatch : aWinsMatch;
      const winnerRounds = 13;
      const loserRounds = randInt(4, 11);
      const scoreA = aWinsMap ? winnerRounds : loserRounds;
      const scoreB = aWinsMap ? loserRounds : winnerRounds;

      const matchMap = await prisma.matchMap.create({
        data: {
          matchId: match.id,
          mapId: maps[randInt(0, maps.length - 1)].id,
          mapNumber,
          status: MapStatus.COMPLETED,
          scoreA,
          scoreB,
          firstHalfA: Math.min(scoreA, randInt(3, 9)),
          firstHalfB: Math.min(scoreB, randInt(3, 9)),
          winnerId: aWinsMap ? teamA.id : teamB.id,
          pickedByTeamId: mapNumber === 1 ? teamA.id : mapNumber === 2 ? teamB.id : null,
        },
      });

      const rounds = scoreA + scoreB;
      for (const side of [f.a, f.b]) {
        for (const player of playersByTeam[side]) {
          const kills = randInt(8, Math.max(12, rounds));
          const deaths = randInt(8, Math.max(12, rounds - 2));
          await prisma.playerStat.create({
            data: {
              playerId: player.id,
              teamId: teams[side].id,
              matchMapId: matchMap.id,
              kills,
              deaths,
              assists: randInt(1, 8),
              headshots: Math.floor(kills * (0.35 + rand() * 0.3)),
              flashAssists: randInt(0, 4),
              firstKills: randInt(0, 5),
              firstDeaths: randInt(0, 5),
              clutchesWon: randInt(0, 2),
              utilityDamage: randInt(20, 160),
              adr: Math.round((55 + rand() * 45) * 10) / 10,
              kast: Math.round((60 + rand() * 25) * 10) / 10,
              rating: Math.round((0.75 + rand() * 0.7) * 100) / 100,
            },
          });
        }
      }
    }
  }

  // Rankings (HLTV-style) + internal Elo for each team.
  const rankingDate = new Date("2026-06-30");
  const order = ["team-vitality", "team-spirit", "natus-vincere", "faze-clan", "g2-esports"];
  for (const [i, slug] of order.entries()) {
    await prisma.ranking.create({
      data: {
        teamId: teams[slug].id,
        source: RankingSource.HLTV,
        rank: i + 1,
        points: 1000 - i * 120,
        date: rankingDate,
      },
    });
    await prisma.teamRating.create({
      data: {
        teamId: teams[slug].id,
        system: RatingSystem.ELO,
        rating: 1600 - i * 45,
        date: rankingDate,
      },
    });
  }

  // Per-map strengths for the top two teams.
  for (const slug of ["team-vitality", "team-spirit"]) {
    for (const map of maps.slice(0, 4)) {
      await prisma.teamMapStrength.create({
        data: {
          teamId: teams[slug].id,
          mapId: map.id,
          winRate: Math.round((0.45 + rand() * 0.4) * 100) / 100,
          roundWinRate: Math.round((0.45 + rand() * 0.15) * 100) / 100,
          sampleSize: randInt(8, 30),
          asOfDate: rankingDate,
        },
      });
    }
  }

  // Rolling form for every player.
  for (const slug of order) {
    for (const player of playersByTeam[slug]) {
      await prisma.playerRollingStat.create({
        data: {
          playerId: player.id,
          window: "LAST_10_MAPS",
          rating: Math.round((0.85 + rand() * 0.5) * 100) / 100,
          kd: Math.round((0.8 + rand() * 0.6) * 100) / 100,
          adr: Math.round((60 + rand() * 30) * 10) / 10,
          kast: Math.round((62 + rand() * 20) * 10) / 10,
          sampleSize: 10,
          asOfDate: rankingDate,
        },
      });
    }
  }

  await prisma.patch.create({
    data: {
      version: "1.41.2.1",
      releasedAt: new Date("2026-06-17"),
      summary: "Train lighting pass, grenade trajectory fixes, subtick tuning.",
    },
  });

  await prisma.transfer.create({
    data: {
      playerId: playersByTeam["team-vitality"][4].id,
      fromTeamId: teams["faze-clan"].id,
      toTeamId: teams["team-vitality"].id,
      type: TransferType.TRANSFER,
      date: new Date("2025-01-08"),
      notes: "Seed example transfer.",
    },
  });

  await prisma.historicalSnapshot.create({
    data: {
      entity: SnapshotEntity.RANKING,
      date: rankingDate,
      payload: { source: "HLTV", top5: order },
    },
  });

  const counts = {
    teams: await prisma.team.count(),
    players: await prisma.player.count(),
    rosters: await prisma.roster.count(),
    events: await prisma.event.count(),
    matches: await prisma.match.count(),
    matchMaps: await prisma.matchMap.count(),
    playerStats: await prisma.playerStat.count(),
    rankings: await prisma.ranking.count(),
    teamRatings: await prisma.teamRating.count(),
    mapStrengths: await prisma.teamMapStrength.count(),
    rollingStats: await prisma.playerRollingStat.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
