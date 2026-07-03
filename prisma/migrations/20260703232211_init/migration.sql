-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('IGL', 'AWPER', 'RIFLER', 'SUPPORT', 'LURKER', 'COACH');

-- CreateEnum
CREATE TYPE "EventTier" AS ENUM ('S', 'A', 'B', 'C', 'QUALIFIER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MapStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RankingSource" AS ENUM ('HLTV', 'VALVE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "RatingSystem" AS ENUM ('ELO', 'GLICKO', 'TRUESKILL');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('TRANSFER', 'LOAN', 'BENCHED', 'RETIRED', 'STAND_IN');

-- CreateEnum
CREATE TYPE "SnapshotEntity" AS ENUM ('TEAM', 'PLAYER', 'RANKING');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "logoUrl" TEXT,
    "foundedAt" TIMESTAMP(3),
    "disbanded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "country" TEXT,
    "role" "PlayerRole" NOT NULL DEFAULT 'RIFLER',
    "birthdate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roster" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "PlayerRole" NOT NULL DEFAULT 'RIFLER',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "EventTier" NOT NULL DEFAULT 'B',
    "prizePool" INTEGER,
    "location" TEXT,
    "isLan" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "eventId" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "stage" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActiveDuty" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GameMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchMap" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "mapNumber" INTEGER NOT NULL,
    "status" "MapStatus" NOT NULL DEFAULT 'UPCOMING',
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "firstHalfA" INTEGER NOT NULL DEFAULT 0,
    "firstHalfB" INTEGER NOT NULL DEFAULT 0,
    "overtimeA" INTEGER NOT NULL DEFAULT 0,
    "overtimeB" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "pickedByTeamId" TEXT,

    CONSTRAINT "MatchMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchMapId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "headshots" INTEGER NOT NULL DEFAULT 0,
    "flashAssists" INTEGER NOT NULL DEFAULT 0,
    "firstKills" INTEGER NOT NULL DEFAULT 0,
    "firstDeaths" INTEGER NOT NULL DEFAULT 0,
    "clutchesWon" INTEGER NOT NULL DEFAULT 0,
    "utilityDamage" INTEGER NOT NULL DEFAULT 0,
    "adr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kast" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranking" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "source" "RankingSource" NOT NULL,
    "rank" INTEGER NOT NULL,
    "points" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fromTeamId" TEXT,
    "toTeamId" TEXT,
    "type" "TransferType" NOT NULL DEFAULT 'TRANSFER',
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patch" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,

    CONSTRAINT "Patch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalSnapshot" (
    "id" TEXT NOT NULL,
    "entity" "SnapshotEntity" NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "HistoricalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRating" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "system" "RatingSystem" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION,
    "volatility" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMapStrength" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "roundWinRate" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMapStrength_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRollingStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "kd" DOUBLE PRECISION NOT NULL,
    "adr" DOUBLE PRECISION NOT NULL,
    "kast" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRollingStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Team_name_idx" ON "Team"("name");

-- CreateIndex
CREATE INDEX "Team_country_idx" ON "Team"("country");

-- CreateIndex
CREATE UNIQUE INDEX "Player_slug_key" ON "Player"("slug");

-- CreateIndex
CREATE INDEX "Player_nickname_idx" ON "Player"("nickname");

-- CreateIndex
CREATE INDEX "Player_country_idx" ON "Player"("country");

-- CreateIndex
CREATE INDEX "Roster_playerId_endDate_idx" ON "Roster"("playerId", "endDate");

-- CreateIndex
CREATE INDEX "Roster_teamId_endDate_idx" ON "Roster"("teamId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Roster_teamId_playerId_startDate_key" ON "Roster"("teamId", "playerId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_name_idx" ON "Event"("name");

-- CreateIndex
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE INDEX "Match_eventId_idx" ON "Match"("eventId");

-- CreateIndex
CREATE INDEX "Match_status_scheduledAt_idx" ON "Match"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");

-- CreateIndex
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMap_name_key" ON "GameMap"("name");

-- CreateIndex
CREATE INDEX "MatchMap_mapId_idx" ON "MatchMap"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchMap_matchId_mapNumber_key" ON "MatchMap"("matchId", "mapNumber");

-- CreateIndex
CREATE INDEX "PlayerStat_playerId_idx" ON "PlayerStat"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStat_teamId_idx" ON "PlayerStat"("teamId");

-- CreateIndex
CREATE INDEX "PlayerStat_matchMapId_idx" ON "PlayerStat"("matchMapId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStat_playerId_matchMapId_key" ON "PlayerStat"("playerId", "matchMapId");

-- CreateIndex
CREATE INDEX "Ranking_source_date_rank_idx" ON "Ranking"("source", "date", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Ranking_teamId_source_date_key" ON "Ranking"("teamId", "source", "date");

-- CreateIndex
CREATE INDEX "Transfer_playerId_date_idx" ON "Transfer"("playerId", "date");

-- CreateIndex
CREATE INDEX "Transfer_date_idx" ON "Transfer"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Patch_version_key" ON "Patch"("version");

-- CreateIndex
CREATE INDEX "Patch_releasedAt_idx" ON "Patch"("releasedAt");

-- CreateIndex
CREATE INDEX "HistoricalSnapshot_entity_date_idx" ON "HistoricalSnapshot"("entity", "date");

-- CreateIndex
CREATE INDEX "HistoricalSnapshot_teamId_date_idx" ON "HistoricalSnapshot"("teamId", "date");

-- CreateIndex
CREATE INDEX "HistoricalSnapshot_playerId_date_idx" ON "HistoricalSnapshot"("playerId", "date");

-- CreateIndex
CREATE INDEX "TeamRating_system_date_idx" ON "TeamRating"("system", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRating_teamId_system_date_key" ON "TeamRating"("teamId", "system", "date");

-- CreateIndex
CREATE INDEX "TeamMapStrength_mapId_asOfDate_idx" ON "TeamMapStrength"("mapId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMapStrength_teamId_mapId_asOfDate_key" ON "TeamMapStrength"("teamId", "mapId", "asOfDate");

-- CreateIndex
CREATE INDEX "PlayerRollingStat_window_asOfDate_idx" ON "PlayerRollingStat"("window", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRollingStat_playerId_window_asOfDate_key" ON "PlayerRollingStat"("playerId", "window", "asOfDate");

-- AddForeignKey
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMap" ADD CONSTRAINT "MatchMap_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMap" ADD CONSTRAINT "MatchMap_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "GameMap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMap" ADD CONSTRAINT "MatchMap_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMap" ADD CONSTRAINT "MatchMap_pickedByTeamId_fkey" FOREIGN KEY ("pickedByTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStat" ADD CONSTRAINT "PlayerStat_matchMapId_fkey" FOREIGN KEY ("matchMapId") REFERENCES "MatchMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranking" ADD CONSTRAINT "Ranking_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalSnapshot" ADD CONSTRAINT "HistoricalSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalSnapshot" ADD CONSTRAINT "HistoricalSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRating" ADD CONSTRAINT "TeamRating_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMapStrength" ADD CONSTRAINT "TeamMapStrength_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMapStrength" ADD CONSTRAINT "TeamMapStrength_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "GameMap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRollingStat" ADD CONSTRAINT "PlayerRollingStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
