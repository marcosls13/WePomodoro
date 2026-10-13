-- AlterTable
ALTER TABLE "Message" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- Messages from guests that still exist can be marked; ones whose guest already
-- expired can't be told apart from deleted users and stay false.
UPDATE "Message" SET "isGuest" = true WHERE "guestSessionId" IS NOT NULL;
