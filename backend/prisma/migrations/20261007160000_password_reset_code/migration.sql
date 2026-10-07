-- AlterEnum
ALTER TYPE "EmailTokenPurpose" ADD VALUE 'PASSWORD_RESET_CODE' BEFORE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "EmailToken" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- Prisma doesn't express CHECK constraints; keep these in versioned SQL.
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_attempts_check"
  CHECK ("failedAttempts" >= 0);
