import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { ApiError, transaction, type Context } from "../api/common.js";
import { hashPassword, tokenHash } from "./auth.service.js";

const CODE_TTL_MS = 10 * 60_000;
const RESET_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

const invalidCode = () =>
  new ApiError(400, "Invalid or expired code; request a new one");

// Six digits are guessable offline, so the hash also covers the user ID and
// rows are short-lived and attempt-limited. Never reveals which part was wrong.
function codeHash(userId: number, code: string) {
  return createHash("sha256")
    .update(`reset:${String(userId)}:${code}`)
    .digest("hex");
}

function sameHash(a: string, b: string) {
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// Step 1: email a six-digit code. Answers the same whether or not the email
// belongs to an account, so it can't be used to discover registered addresses.
export async function requestPasswordReset(ctx: Context, address: string) {
  const user = await ctx.db.user.findUnique({ where: { email: address } });
  if (!user) return;
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = ctx.now();
  await transaction(ctx, async (tx) => {
    // Only the newest request is valid.
    await tx.emailToken.deleteMany({
      where: {
        userId: user.id,
        purpose: { in: ["PASSWORD_RESET_CODE", "PASSWORD_RESET"] },
        usedAt: null,
      },
    });
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET_CODE",
        email: user.email,
        tokenHash: codeHash(user.id, code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    });
  });
  try {
    await ctx.mailer.send(
      user.email,
      "Your WePomodoro password reset code",
      `Your password reset code is ${code}. It expires in 10 minutes.\n` +
        "If you didn't ask for this, you can ignore this email.",
    );
  } catch (error) {
    // Don't tell the caller: a failure would reveal the address exists.
    console.error("Could not send password reset email", error);
  }
}

// Step 2: check the code. On success the code is spent and a longer random
// token is returned; the client uses it to show the new-password form.
export async function verifyResetCode(
  ctx: Context,
  address: string,
  code: string,
) {
  const user = await ctx.db.user.findUnique({ where: { email: address } });
  if (!user) throw invalidCode();
  const now = ctx.now();
  return transaction(ctx, async (tx) => {
    const row = await tx.emailToken.findFirst({
      where: {
        userId: user.id,
        purpose: "PASSWORD_RESET_CODE",
        usedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_CODE_ATTEMPTS },
        email: user.email,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) throw invalidCode();
    if (!sameHash(row.tokenHash, codeHash(user.id, code))) {
      await tx.emailToken.update({
        where: { id: row.id },
        data: { failedAttempts: { increment: 1 } },
      });
      // Commit the counter even though the request fails.
      return null;
    }
    const spent = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count !== 1) throw invalidCode();
    const resetToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        email: user.email,
        tokenHash: tokenHash(resetToken),
        createdAt: now,
        expiresAt,
      },
    });
    return { resetToken, expiresAt };
  }).then((result) => {
    if (!result) throw invalidCode();
    return result;
  });
}

// Step 3: set the new password. Ends every existing login, because whoever
// had the old password (or a stolen session) must not stay signed in.
export async function confirmPasswordReset(
  ctx: Context,
  resetToken: string,
  password: string,
) {
  const hash = await hashPassword(password);
  const now = ctx.now();
  await transaction(ctx, async (tx) => {
    const row = await tx.emailToken.findUnique({
      where: { tokenHash: tokenHash(resetToken) },
      include: { user: true },
    });
    if (
      row?.purpose !== "PASSWORD_RESET" ||
      row.usedAt ||
      row.expiresAt <= now ||
      row.email !== row.user.email
    )
      throw new ApiError(400, "This reset link is invalid or has expired");
    const spent = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count !== 1)
      throw new ApiError(400, "This reset link is invalid or has expired");
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash: hash },
    });
    await tx.authSession.deleteMany({ where: { userId: row.userId } });
    await tx.loginChallenge.deleteMany({ where: { userId: row.userId } });
  });
}
