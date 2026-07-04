-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "IngestionSyncState" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsUpserted" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "error" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSyncState_sport_provider_task_key" ON "IngestionSyncState"("sport", "provider", "task");

-- CreateIndex
CREATE INDEX "IngestionRun_sport_provider_startedAt_idx" ON "IngestionRun"("sport", "provider", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_externalId_key" ON "Event"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_externalId_key" ON "Player"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_externalId_key" ON "Team"("externalId");

