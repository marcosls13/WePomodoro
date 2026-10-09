-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "createdById" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_roomId_createdById_key" ON "Invite"("roomId", "createdById");

-- CreateIndex
CREATE INDEX "Invite_createdById_idx" ON "Invite"("createdById");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep existing room codes working: each becomes its owner's personal code.
INSERT INTO "Invite" ("id", "roomId", "createdById", "code", "createdAt")
SELECT gen_random_uuid(), "id", "ownerId", "inviteCode", "createdAt" FROM "StudyRoom";

-- Dropping the column also drops the settings CHECK that mentioned it.
ALTER TABLE "StudyRoom" DROP COLUMN "inviteCode";
ALTER TABLE "StudyRoom" ADD CONSTRAINT "StudyRoom_settings_check"
  CHECK (length(btrim("name")) > 0
    AND "focusSeconds" > 0 AND "shortBreakSeconds" > 0
    AND "longBreakSeconds" > 0 AND "cyclesBeforeLongBreak" > 0);
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_code_check"
  CHECK (length(btrim("code")) > 0);
