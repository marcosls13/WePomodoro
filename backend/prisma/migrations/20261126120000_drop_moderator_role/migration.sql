-- The read-only moderator role is gone: only USER and ADMIN remain. Existing
-- moderators become plain users, then the enum is rebuilt without the value.
UPDATE "User" SET "role" = 'USER' WHERE "role" = 'MODERATOR';
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "Role_old";
