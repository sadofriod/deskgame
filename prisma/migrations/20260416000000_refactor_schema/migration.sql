-- Migration: refactor schema to align with docs/implements/schema.prisma
--
-- Key changes:
--   - GameState enum: 'start'/'end' → 'selecting'/'playing'/'ended'
--   - Stage enum: replace old stage names with new flow stages
--   - Room: add roomCode, replace roleConfig(VARCHAR) with roomConfig(JSON),
--           rename currentFloor → currentRound
--   - Player: add seatNo/candidateRoles/selectedRole/passedBet/canSpeak/canVote,
--             rename actionCard → selectedAction, remove role
--   - Round: rename floor → round, replace actionSubmissions with
--            betSubmissions/actionLogs/voteSubmissions/voteResult
--   - Drop PersistedRoom table (replaced by normalized Room/Player/Round/Match)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Drop foreign keys & PersistedRoom table
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Player" DROP CONSTRAINT IF EXISTS "Player_roomId_fkey";
ALTER TABLE "Round" DROP CONSTRAINT IF EXISTS "Round_roomId_fkey";
ALTER TABLE "Match" DROP CONSTRAINT IF EXISTS "Match_roomId_fkey";

DROP TABLE IF EXISTS "PersistedRoom";

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. GameState enum: 'start'/'end' → 'selecting'/'playing'/'ended'
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE "GameState_new" AS ENUM ('wait', 'selecting', 'playing', 'ended');

ALTER TABLE "Room"
  ALTER COLUMN "gameState" TYPE "GameState_new"
  USING (
    CASE "gameState"::text
      WHEN 'wait'  THEN 'wait'::"GameState_new"
      WHEN 'start' THEN 'playing'::"GameState_new"
      WHEN 'end'   THEN 'ended'::"GameState_new"
      ELSE              'wait'::"GameState_new"
    END
  );

DROP TYPE "GameState";
ALTER TYPE "GameState_new" RENAME TO "GameState";

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Stage enum: replace old stage names with new flow stages
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE "Stage_new" AS ENUM (
  'lobby', 'roleSelection', 'bet', 'action', 'settlement', 'discussionVote', 'review'
);

ALTER TABLE "Room"
  ALTER COLUMN "currentStage" TYPE "Stage_new"
  USING (
    CASE "currentStage"::text
      WHEN 'action' THEN 'action'::"Stage_new"
      ELSE               'lobby'::"Stage_new"
    END
  );

DROP TYPE "Stage";
ALTER TYPE "Stage_new" RENAME TO "Stage";

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Room table changes
-- ──────────────────────────────────────────────────────────────────────────────

-- Add roomConfig JSON (absorbs the old roleConfig string)
ALTER TABLE "Room" ADD COLUMN "roomConfig" JSONB NOT NULL DEFAULT '{}';

-- Drop old roleConfig column
ALTER TABLE "Room" DROP COLUMN "roleConfig";

-- Rename currentFloor → currentRound
ALTER TABLE "Room" RENAME COLUMN "currentFloor" TO "currentRound";
ALTER TABLE "Room" ALTER COLUMN "currentRound" SET DEFAULT 0;

-- Add roomCode: generate a unique 6-digit placeholder from each roomId,
-- then enforce the unique constraint.
ALTER TABLE "Room" ADD COLUMN "roomCode" VARCHAR(6) NOT NULL DEFAULT '';
UPDATE "Room"
  SET "roomCode" = LPAD(
    SUBSTRING(REGEXP_REPLACE("roomId", '[^0-9]', '', 'g') || '000000' FROM 1 FOR 6),
    6, '0'
  );
CREATE UNIQUE INDEX "Room_roomCode_key" ON "Room"("roomCode");

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Player table changes
-- ──────────────────────────────────────────────────────────────────────────────

-- Add new columns
ALTER TABLE "Player" ADD COLUMN "seatNo"         INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "candidateRoles" JSONB;
ALTER TABLE "Player" ADD COLUMN "selectedRole"   "Role";
ALTER TABLE "Player" ADD COLUMN "selectedAction" "ActionCard";
ALTER TABLE "Player" ADD COLUMN "passedBet"      BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "canSpeak"       BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE "Player" ADD COLUMN "canVote"        BOOLEAN     NOT NULL DEFAULT true;

-- Migrate data: copy role → selectedRole, actionCard → selectedAction
UPDATE "Player" SET "selectedRole"   = "role";
UPDATE "Player" SET "selectedAction" = "actionCard";

-- Drop old columns
ALTER TABLE "Player" DROP COLUMN "role";
ALTER TABLE "Player" DROP COLUMN "actionCard";

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Round table: drop and recreate with new structure
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE "Round";

CREATE TABLE "Round" (
    "roomId"           VARCHAR(64)      NOT NULL,
    "round"            INTEGER          NOT NULL,
    "environmentCard"  "EnvironmentCard",
    "betSubmissions"   JSONB            NOT NULL DEFAULT '[]',
    "actionLogs"       JSONB            NOT NULL DEFAULT '[]',
    "voteSubmissions"  JSONB            NOT NULL DEFAULT '[]',
    "voteResult"       JSONB            NOT NULL DEFAULT 'null',
    "settlementResult" JSONB            NOT NULL DEFAULT 'null',
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("roomId", "round")
);

CREATE INDEX "Round_roomId_idx" ON "Round"("roomId");

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Restore foreign key constraints
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Player" ADD CONSTRAINT "Player_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Round" ADD CONSTRAINT "Round_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;
