-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "UserAvatar" (
    "userId" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The API enforces the same limits; this keeps the table sane if written elsewhere.
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_size_check" CHECK (length("data") BETWEEN 1 AND 524288);
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_type_check" CHECK ("contentType" IN ('image/png', 'image/jpeg', 'image/webp'));
