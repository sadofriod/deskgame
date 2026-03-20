-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameState" AS ENUM ('wait', 'start', 'end');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('night', 'action', 'env', 'actionResolve', 'hurt', 'talk', 'vote');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('fatter1', 'fatter2', 'fatter', 'passenger');

-- CreateEnum
CREATE TYPE "ActionCard" AS ENUM ('listen', 'blow', 'grab', 'endure', 'suck', 'scold');

-- CreateEnum
CREATE TYPE "EnvironmentCard" AS ENUM ('gas', 'stink', 'stew', 'none');

-- CreateTable
CREATE TABLE "Room" (
    "roomId" VARCHAR(64) NOT NULL,
    "ownerOpenId" VARCHAR(64) NOT NULL,
    "gameState" "GameState" NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "roleConfig" VARCHAR(32) NOT NULL,
    "currentFloor" INTEGER NOT NULL,
    "currentStage" "Stage" NOT NULL,
    "envDeck" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("roomId")
);

-- CreateTable
CREATE TABLE "Player" (
    "roomId" VARCHAR(64) NOT NULL,
    "openId" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "avatar" VARCHAR(256) NOT NULL,
    "role" "Role" NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 4,
    "votePower" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "actionCard" "ActionCard",
    "voteTarget" VARCHAR(64),
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "joinTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("roomId","openId")
);

-- CreateTable
CREATE TABLE "Round" (
    "roomId" VARCHAR(64) NOT NULL,
    "floor" INTEGER NOT NULL,
    "environmentCard" "EnvironmentCard",
    "actionSubmissions" JSONB NOT NULL,
    "voteSubmissions" JSONB NOT NULL,
    "settlementResult" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("roomId","floor")
);

-- CreateTable
CREATE TABLE "Match" (
    "matchId" VARCHAR(64) NOT NULL,
    "roomId" VARCHAR(64) NOT NULL,
    "rounds" JSONB NOT NULL,
    "winnerResult" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "PersistedRoom" (
    "roomId" VARCHAR(64) NOT NULL,
    "roomCode" VARCHAR(16) NOT NULL,
    "ownerOpenId" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersistedRoom_pkey" PRIMARY KEY ("roomId")
);

-- CreateIndex
CREATE INDEX "Player_roomId_idx" ON "Player"("roomId");

-- CreateIndex
CREATE INDEX "Round_roomId_idx" ON "Round"("roomId");

-- CreateIndex
CREATE INDEX "Match_roomId_idx" ON "Match"("roomId");

-- CreateIndex
CREATE INDEX "PersistedRoom_roomCode_idx" ON "PersistedRoom"("roomCode");

-- CreateIndex
CREATE INDEX "PersistedRoom_ownerOpenId_idx" ON "PersistedRoom"("ownerOpenId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;
