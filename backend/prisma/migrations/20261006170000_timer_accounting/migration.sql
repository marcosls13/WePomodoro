-- AlterTable
ALTER TABLE "PomodoroSession" ADD COLUMN     "resumedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SessionParticipant" ADD COLUMN     "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Initial accounting baseline for existing participation rows.
UPDATE "SessionParticipant" AS p
SET "creditedAt" = GREATEST(p."joinedAt", COALESCE(p."leftAt", p."completedAt", s."pausedAt", CURRENT_TIMESTAMP))
FROM "PomodoroSession" AS s WHERE s."id" = p."sessionId";
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_resume_check"
  CHECK (("resumedAt" IS NULL OR "resumedAt" >= "startedAt")
    AND ("pausedAt" IS NULL OR "pausedAt" >= COALESCE("resumedAt", "startedAt"))
    AND ("endedAt" IS NULL OR "endedAt" >= COALESCE("resumedAt", "startedAt")));
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_credit_check"
  CHECK ("creditedAt" >= "joinedAt");

-- Keep the worker scan limited to active timers rather than all study history.
CREATE INDEX "PomodoroSession_status_startedAt_idx" ON "PomodoroSession"("status", "startedAt");
