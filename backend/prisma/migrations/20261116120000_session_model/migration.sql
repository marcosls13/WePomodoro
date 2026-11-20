-- One session model: a study session is the server people join, with its chat,
-- members and one shared timer. StudyRoom, RoomMember, SessionParticipant and the
-- per-phase PomodoroSession rows are merged into PomodoroSession + SessionMember.
-- Study totals move to UserStat together with minigame wins and losses; chat,
-- presence and the minigame tables are dropped.

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED');

-- Lifetime totals: study time (filled from the old attendance rows, registered
-- users only) plus minigame wins and losses. No game ever recorded a result, so
-- GameResult is dropped without carrying anything over.
CREATE TABLE "UserStat" (
    "userId" INTEGER NOT NULL,
    "focusedSeconds" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UserStat_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "UserStat" ADD CONSTRAINT "UserStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStat" ADD CONSTRAINT "UserStat_totals_check"
  CHECK ("focusedSeconds" >= 0 AND "wins" >= 0 AND "losses" >= 0);

INSERT INTO "UserStat" ("userId", "focusedSeconds")
SELECT p."userId", COALESCE(SUM(p."focusedSeconds"), 0)
FROM "SessionParticipant" p
JOIN "PomodoroSession" s ON s."id" = p."sessionId"
WHERE p."userId" IS NOT NULL AND s."phase" = 'FOCUS'
GROUP BY p."userId";

-- Chat is no longer stored (it lives in memory over WebSocket), presence is the
-- WebSocket connection, and the minigame catalogue and results are gone.
DROP TABLE "Message";
DROP TABLE "Presence";
DROP TABLE "GameResult";
DROP TABLE "MiniGame";

-- Move the old per-phase table out of the way (only its indexes share names).
ALTER TABLE "PomodoroSession" RENAME TO "OldPhase";
ALTER INDEX "PomodoroSession_pkey" RENAME TO "OldPhase_pkey";
ALTER INDEX "PomodoroSession_one_live_timer_per_room" RENAME TO "OldPhase_one_live_timer_per_room";
ALTER INDEX "PomodoroSession_roomId_startedAt_idx" RENAME TO "OldPhase_roomId_startedAt_idx";
ALTER INDEX "PomodoroSession_status_startedAt_idx" RENAME TO "OldPhase_status_startedAt_idx";

-- The room becomes the session.
ALTER TABLE "StudyRoom" RENAME TO "PomodoroSession";
ALTER INDEX "StudyRoom_pkey" RENAME TO "PomodoroSession_pkey";
ALTER INDEX "StudyRoom_code_key" RENAME TO "PomodoroSession_code_key";
ALTER TABLE "PomodoroSession" DROP CONSTRAINT "StudyRoom_settings_check"; -- re-added below for the new columns
ALTER TABLE "PomodoroSession" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "PomodoroSession" ALTER COLUMN "ownerId" DROP NOT NULL; -- solo timers below; the column is dropped at the end
ALTER TABLE "PomodoroSession"
  ADD COLUMN "phase" "PomodoroPhase" NOT NULL DEFAULT 'FOCUS',
  ADD COLUMN "timerStatus" "TimerStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "plannedSeconds" INTEGER NOT NULL DEFAULT 1500,
  ADD COLUMN "resumedAt" TIMESTAMP(3),
  ADD COLUMN "elapsedSeconds" INTEGER NOT NULL DEFAULT 0;

-- A room's live phase, if any, becomes its running or paused timer.
UPDATE "PomodoroSession" r SET
  "phase" = o."phase",
  "timerStatus" = CASE o."status" WHEN 'ACTIVE' THEN 'RUNNING'::"TimerStatus" ELSE 'PAUSED'::"TimerStatus" END,
  "plannedSeconds" = o."plannedSeconds",
  "resumedAt" = CASE o."status" WHEN 'ACTIVE' THEN COALESCE(o."resumedAt", o."startedAt") END,
  "elapsedSeconds" = o."elapsedSeconds"
FROM "OldPhase" o
WHERE o."roomId" = r."id" AND o."status" IN ('ACTIVE', 'PAUSED');

-- Rooms with no live phase wait for the next one: a break after a focus,
-- otherwise focus. (There are only two phases now; SHORT_BREAK and LONG_BREAK
-- both become BREAK when the enum is replaced at the end.)
UPDATE "PomodoroSession" r SET
  "phase" = n."next",
  "plannedSeconds" = CASE n."next" WHEN 'FOCUS' THEN r."focusSeconds" ELSE r."shortBreakSeconds" END
FROM (
  SELECT r2."id",
         CASE
           WHEN (SELECT o."phase" FROM "OldPhase" o
                 WHERE o."roomId" = r2."id" AND o."status" = 'COMPLETED'
                 ORDER BY o."endedAt" DESC, o."id" DESC LIMIT 1) = 'FOCUS'
           THEN 'SHORT_BREAK'::"PomodoroPhase"
           ELSE 'FOCUS'::"PomodoroPhase"
         END AS "next"
  FROM "PomodoroSession" r2
) n
WHERE n."id" = r."id" AND r."timerStatus" = 'IDLE';

-- Members: room members, in the timer from now on. A member who was in the live
-- phase keeps that phase's progress.
CREATE TABLE "SessionMember" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" INTEGER,
    "guestSessionId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mutedUntil" TIMESTAMP(3),
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionMember_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SessionMember" ("id", "sessionId", "userId", "guestSessionId", "joinedAt",
                             "mutedUntil", "isOwner", "creditedAt")
SELECT m."id", m."roomId", m."userId", m."guestSessionId", m."joinedAt", m."mutedUntil",
       false,
       GREATEST(m."joinedAt", COALESCE(p."creditedAt", CURRENT_TIMESTAMP))
FROM "RoomMember" m
LEFT JOIN "OldPhase" o ON o."roomId" = m."roomId" AND o."status" IN ('ACTIVE', 'PAUSED')
LEFT JOIN "SessionParticipant" p ON p."sessionId" = o."id" AND p."leftAt" IS NULL
  AND p."userId" IS NOT DISTINCT FROM m."userId"
  AND p."guestSessionId" IS NOT DISTINCT FROM m."guestSessionId";

-- The owner is a member. Add the row if somehow missing, then flag it.
INSERT INTO "SessionMember" ("id", "sessionId", "userId")
SELECT gen_random_uuid(), r."id", r."ownerId"
FROM "PomodoroSession" r
WHERE NOT EXISTS (SELECT 1 FROM "SessionMember" m WHERE m."sessionId" = r."id" AND m."userId" = r."ownerId");
UPDATE "SessionMember" m SET "isOwner" = true
FROM "PomodoroSession" r WHERE r."id" = m."sessionId" AND r."ownerId" = m."userId";

-- Live solo timers (no room) become sessions without a code, owned by their one member.
INSERT INTO "PomodoroSession" ("id", "name", "code", "createdAt", "phase",
                               "timerStatus", "plannedSeconds", "resumedAt", "elapsedSeconds", "ownerId")
SELECT o."id", 'Solo timer', NULL, o."startedAt", o."phase",
       CASE o."status" WHEN 'ACTIVE' THEN 'RUNNING'::"TimerStatus" ELSE 'PAUSED'::"TimerStatus" END,
       o."plannedSeconds",
       CASE o."status" WHEN 'ACTIVE' THEN COALESCE(o."resumedAt", o."startedAt") END,
       o."elapsedSeconds",
       NULL
FROM "OldPhase" o
WHERE o."roomId" IS NULL AND o."status" IN ('ACTIVE', 'PAUSED');
INSERT INTO "SessionMember" ("id", "sessionId", "userId", "guestSessionId", "joinedAt", "isOwner",
                             "creditedAt")
SELECT p."id", p."sessionId", p."userId", p."guestSessionId", p."joinedAt", true,
       p."creditedAt"
FROM "SessionParticipant" p
JOIN "OldPhase" o ON o."id" = p."sessionId"
WHERE o."roomId" IS NULL AND o."status" IN ('ACTIVE', 'PAUSED') AND p."leftAt" IS NULL;
-- A solo timer whose participant had already left has no owner and no use.
DELETE FROM "PomodoroSession" s
WHERE s."code" IS NULL AND NOT EXISTS (SELECT 1 FROM "SessionMember" m WHERE m."sessionId" = s."id");

-- Remove what the merge replaced.
DROP TABLE "SessionParticipant";
DROP TABLE "RoomMember";
DROP TABLE "OldPhase";
DROP TYPE "SessionStatus";

-- Only the study and break lengths remain as settings; closing a session is gone
-- (a closed room is deleted, the owner can delete a session instead).
DELETE FROM "PomodoroSession" WHERE "closedAt" IS NOT NULL;
-- The phase length is now derived from the settings; a live solo timer keeps its
-- own length by turning it into the matching setting.
UPDATE "PomodoroSession" SET
  "focusSeconds" = CASE WHEN "phase"::text = 'FOCUS' THEN "plannedSeconds" ELSE "focusSeconds" END,
  "shortBreakSeconds" = CASE WHEN "phase"::text = 'FOCUS' THEN "shortBreakSeconds" ELSE "plannedSeconds" END
WHERE "code" IS NULL;
-- Unverified signups waiting on their deadline would be deleted by the cleanup
-- anyway; pending signups replaced that mechanism, so verifyBy goes.
DELETE FROM "User" WHERE "emailVerifiedAt" IS NULL AND "verifyBy" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "verifyBy";
ALTER TABLE "Friendship" DROP COLUMN "respondedAt";
ALTER TABLE "PomodoroSession"
  DROP COLUMN "plannedSeconds",
  DROP COLUMN "ownerId",
  DROP COLUMN "longBreakSeconds",
  DROP COLUMN "cyclesBeforeLongBreak",
  DROP COLUMN "closedAt",
  DROP COLUMN "updatedAt";
ALTER TABLE "PomodoroSession" RENAME COLUMN "shortBreakSeconds" TO "breakSeconds";
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_settings_check"
  CHECK (length(btrim("name")) > 0 AND "focusSeconds" > 0 AND "breakSeconds" > 0);

-- Two phases: FOCUS and BREAK.
CREATE TYPE "PomodoroPhase_new" AS ENUM ('FOCUS', 'BREAK');
ALTER TABLE "PomodoroSession" ALTER COLUMN "phase" DROP DEFAULT;
ALTER TABLE "PomodoroSession" ALTER COLUMN "phase" TYPE "PomodoroPhase_new"
  USING (CASE "phase"::text WHEN 'FOCUS' THEN 'FOCUS' ELSE 'BREAK' END)::"PomodoroPhase_new";
DROP TYPE "PomodoroPhase";
ALTER TYPE "PomodoroPhase_new" RENAME TO "PomodoroPhase";
ALTER TABLE "PomodoroSession" ALTER COLUMN "phase" SET DEFAULT 'FOCUS';

-- Indexes, keys and rules of the new tables.
CREATE INDEX "PomodoroSession_timerStatus_idx" ON "PomodoroSession"("timerStatus");
CREATE UNIQUE INDEX "SessionMember_sessionId_userId_key" ON "SessionMember"("sessionId", "userId");
CREATE UNIQUE INDEX "SessionMember_sessionId_guestSessionId_key" ON "SessionMember"("sessionId", "guestSessionId");
CREATE INDEX "SessionMember_userId_idx" ON "SessionMember"("userId");
CREATE INDEX "SessionMember_guestSessionId_idx" ON "SessionMember"("guestSessionId");
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PomodoroSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma doesn't express these; keep them in versioned SQL.
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_identity_check"
  CHECK (("userId" IS NOT NULL) <> ("guestSessionId" IS NOT NULL));
ALTER TABLE "SessionMember" ADD CONSTRAINT "SessionMember_progress_check"
  CHECK ("creditedAt" >= "joinedAt");
CREATE UNIQUE INDEX "SessionMember_one_owner_per_session"
  ON "SessionMember" ("sessionId") WHERE "isOwner";
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_timer_check"
  CHECK ("elapsedSeconds" >= 0
    AND (("timerStatus" = 'RUNNING') = ("resumedAt" IS NOT NULL)));
