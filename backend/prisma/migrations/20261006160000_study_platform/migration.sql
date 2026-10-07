-- CreateEnum
CREATE TYPE "PomodoroPhase" AS ENUM ('FOCUS', 'SHORT_BREAK', 'LONG_BREAK');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyRoom" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "focusSeconds" INTEGER NOT NULL DEFAULT 1500,
    "shortBreakSeconds" INTEGER NOT NULL DEFAULT 300,
    "longBreakSeconds" INTEGER NOT NULL DEFAULT 900,
    "cyclesBeforeLongBreak" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "StudyRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" INTEGER,
    "guestSessionId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PomodoroSession" (
    "id" UUID NOT NULL,
    "roomId" UUID,
    "phase" "PomodoroPhase" NOT NULL DEFAULT 'FOCUS',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plannedSeconds" INTEGER NOT NULL DEFAULT 1500,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PomodoroSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" INTEGER,
    "guestSessionId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "focusedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniGame" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MiniGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResult" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_expiresAt_idx" ON "GuestSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyRoom_inviteCode_key" ON "StudyRoom"("inviteCode");

-- CreateIndex
CREATE INDEX "StudyRoom_ownerId_idx" ON "StudyRoom"("ownerId");

-- CreateIndex
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");

-- CreateIndex
CREATE INDEX "RoomMember_guestSessionId_idx" ON "RoomMember"("guestSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_guestSessionId_key" ON "RoomMember"("roomId", "guestSessionId");

-- CreateIndex
CREATE INDEX "PomodoroSession_roomId_startedAt_idx" ON "PomodoroSession"("roomId", "startedAt");

-- CreateIndex
CREATE INDEX "SessionParticipant_userId_joinedAt_idx" ON "SessionParticipant"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "SessionParticipant_guestSessionId_idx" ON "SessionParticipant"("guestSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionId_userId_key" ON "SessionParticipant"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionId_guestSessionId_key" ON "SessionParticipant"("sessionId", "guestSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniGame_key_key" ON "MiniGame"("key");

-- CreateIndex
CREATE INDEX "GameResult_userId_playedAt_idx" ON "GameResult"("userId", "playedAt");

-- CreateIndex
CREATE INDEX "GameResult_userId_gameId_score_idx" ON "GameResult"("userId", "gameId", "score");

-- CreateIndex
CREATE INDEX "GameResult_gameId_idx" ON "GameResult"("gameId");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyRoom" ADD CONSTRAINT "StudyRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StudyRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PomodoroSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MiniGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma doesn't express CHECK constraints; keep these in versioned SQL.
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_displayName_check"
  CHECK (length(btrim("displayName")) > 0);
ALTER TABLE "StudyRoom" ADD CONSTRAINT "StudyRoom_settings_check"
  CHECK (length(btrim("name")) > 0 AND length(btrim("inviteCode")) > 0
    AND "focusSeconds" > 0 AND "shortBreakSeconds" > 0
    AND "longBreakSeconds" > 0 AND "cyclesBeforeLongBreak" > 0);
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_identity_check"
  CHECK (("userId" IS NOT NULL) <> ("guestSessionId" IS NOT NULL));
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_dates_check"
  CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt");
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_identity_check"
  CHECK (("userId" IS NOT NULL) <> ("guestSessionId" IS NOT NULL));
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_progress_check"
  CHECK ("focusedSeconds" >= 0
    AND ("leftAt" IS NULL OR "leftAt" >= "joinedAt")
    AND ("completedAt" IS NULL OR "completedAt" >= "joinedAt"));
ALTER TABLE "PomodoroSession" ADD CONSTRAINT "PomodoroSession_progress_check"
  CHECK ("plannedSeconds" > 0 AND "elapsedSeconds" >= 0
    AND "elapsedSeconds" <= "plannedSeconds"
    AND ("endedAt" IS NULL OR "endedAt" >= "startedAt")
    AND ("pausedAt" IS NULL OR "pausedAt" >= "startedAt")
    AND (("status" IN ('COMPLETED', 'CANCELLED')) = ("endedAt" IS NOT NULL))
    AND (("status" = 'PAUSED') = ("pausedAt" IS NOT NULL)));
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_duration_check"
  CHECK ("durationSeconds" >= 0);

-- One shared running or paused timer per room. Completed history is unlimited.
CREATE UNIQUE INDEX "PomodoroSession_one_live_timer_per_room"
  ON "PomodoroSession" ("roomId") WHERE "status" IN ('ACTIVE', 'PAUSED');
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_expiry_check"
  CHECK ("expiresAt" > "createdAt");
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_expiry_check"
  CHECK ("expiresAt" > "createdAt");
