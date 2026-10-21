/*
  Warnings:

  - You are about to drop the `RecoveryCode` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TwoFactor` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `codeHash` to the `LoginChallenge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailTokenPurpose" ADD VALUE 'TWO_FACTOR_ENABLE_CODE';
ALTER TYPE "EmailTokenPurpose" ADD VALUE 'TWO_FACTOR_DISABLE_CODE';

-- DropForeignKey
ALTER TABLE "RecoveryCode" DROP CONSTRAINT "RecoveryCode_userId_fkey";

-- DropForeignKey
ALTER TABLE "TwoFactor" DROP CONSTRAINT "TwoFactor_userId_fkey";

DELETE FROM "LoginChallenge";
-- AlterTable
ALTER TABLE "LoginChallenge" ADD COLUMN     "codeHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "RecoveryCode";

UPDATE "User" u SET "twoFactorEnabledAt" = t."enabledAt"
FROM "TwoFactor" t
WHERE t."userId" = u.id AND t."enabledAt" IS NOT NULL;
-- DropTable
DROP TABLE "TwoFactor";
