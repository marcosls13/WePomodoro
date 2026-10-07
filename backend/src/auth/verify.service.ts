import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { ApiError, transaction, type Context } from "../api/common.js";

const CODE_TTL_MS = 30 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

const invalidCode = () =>
  new ApiError(400, "Invalid or expired code; request a new one");

function codeHash(userId: number, code: string) {
  return createHash("sha256")
    .update(`verify:${String(userId)}:${code}`)
    .digest("hex");
}

// Emails a six-digit code that proves the account owner controls the address.
// Only the newest code is valid. Mail trouble must not fail the caller.
export async function sendVerificationCode(ctx: Context, userId: number) {
  const user = await ctx.db.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Account not found");
  if (user.emailVerifiedAt)
    throw new ApiError(409, "This email is already verified");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = ctx.now();
  await transaction(ctx, async (tx) => {
    await tx.emailToken.deleteMany({
      where: { userId, purpose: "EMAIL_VERIFICATION", usedAt: null },
    });
    await tx.emailToken.create({
      data: {
        userId,
        purpose: "EMAIL_VERIFICATION",
        email: user.email,
        tokenHash: codeHash(userId, code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    });
  });
  try {
    await ctx.mailer.send(
      user.email,
      "Verify your WePomodoro email",
      `Your verification code is ${code}. It expires in 30 minutes.\n` +
        "If you didn't create an account, you can ignore this email.",
    );
  } catch (error) {
    console.error("Could not send verification email", error);
  }
}

export async function verifyEmail(ctx: Context, userId: number, code: string) {
  const now = ctx.now();
  const matched = await transaction(ctx, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "Account not found");
    if (user.emailVerifiedAt) return true;
    const row = await tx.emailToken.findFirst({
      where: {
        userId,
        purpose: "EMAIL_VERIFICATION",
        usedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_CODE_ATTEMPTS },
        // A code sent to a previous address proves nothing about this one.
        email: user.email,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) throw invalidCode();
    const expected = Buffer.from(row.tokenHash, "hex");
    const actual = Buffer.from(codeHash(userId, code), "hex");
    if (!timingSafeEqual(expected, actual)) {
      await tx.emailToken.update({
        where: { id: row.id },
        data: { failedAttempts: { increment: 1 } },
      });
      // Commit the counter, then fail below.
      return false;
    }
    const spent = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count !== 1) throw invalidCode();
    await tx.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: now },
    });
    return true;
  });
  if (!matched) throw invalidCode();
}
