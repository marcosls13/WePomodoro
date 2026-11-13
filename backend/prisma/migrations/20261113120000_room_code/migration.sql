-- Rooms are joined with one shared room code. Personal invite codes, bans,
-- join requests and "who invited this member" are gone.

-- The room code: existing rooms get a random one (lowercase hex, 8 characters).
ALTER TABLE "StudyRoom" ADD COLUMN "code" TEXT;
UPDATE "StudyRoom" SET "code" = substr(md5(random()::text || "id"::text), 1, 8);
ALTER TABLE "StudyRoom" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "StudyRoom_code_key" ON "StudyRoom"("code");

-- DropTable
DROP TABLE "Invite";

-- DropTable
DROP TABLE "RoomBan";

-- DropTable
DROP TABLE "JoinRequest";

-- AlterTable
ALTER TABLE "RoomMember" DROP COLUMN "invitedById";
