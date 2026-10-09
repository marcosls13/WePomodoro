-- CreateTable
CREATE TABLE "Presence" (
    "userId" INTEGER NOT NULL,
    "roomId" UUID,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Presence_seenAt_idx" ON "Presence"("seenAt");

-- CreateIndex
CREATE INDEX "JoinRequest_targetId_idx" ON "JoinRequest"("targetId");

-- CreateIndex
CREATE INDEX "JoinRequest_requesterId_idx" ON "JoinRequest"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinRequest_roomId_requesterId_targetId_key" ON "JoinRequest"("roomId", "requesterId", "targetId");

-- AddForeignKey
ALTER TABLE "Presence" ADD CONSTRAINT "Presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presence" ADD CONSTRAINT "Presence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StudyRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StudyRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma doesn't express CHECK constraints; keep these in versioned SQL.
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_distinct_check"
  CHECK ("requesterId" <> "targetId");
