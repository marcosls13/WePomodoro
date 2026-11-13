-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "provider" "OAuthProvider",
    "providerUserId" TEXT,
    "codeHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "resends" INTEGER NOT NULL DEFAULT 0,
    "resendWindowAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_tokenHash_key" ON "PendingSignup"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");


-- A pending signup is either a password signup or a provider sign-in, never neither.
ALTER TABLE "PendingSignup" ADD CONSTRAINT "PendingSignup_identity_check" CHECK (
    "passwordHash" IS NOT NULL OR ("provider" IS NOT NULL AND "providerUserId" IS NOT NULL)
);
