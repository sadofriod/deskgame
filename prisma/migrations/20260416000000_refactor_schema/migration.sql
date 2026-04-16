-- NOTE:
-- This migration previously contained hand-written SQL for an intermediate
-- schema revision (legacy enum values such as selecting/playing/ended and
-- lobby/roleSelection/discussionVote/review, plus legacy tables/columns such
-- as Player, PersistedRoom, and Room.currentRound transitions).
--
-- That SQL does NOT match the current prisma/schema.prisma (which now defines
-- GameState(wait/start/end), Stage(preparation/.../tieBreak) and a fully
-- normalized Room/RoomPlayer/Match/MatchPlayer/Round/... model) and must not
-- be applied, because it would produce a database schema that Prisma cannot
-- use correctly at deploy/runtime.
--
-- A fresh migration should be generated from the current prisma/schema.prisma
-- using: prisma migrate dev --create-only
--
-- Intentionally left as a no-op placeholder until the regenerated migration
-- is committed.

-- no-op
SELECT 1;
