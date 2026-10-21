import {
  randomBytes,
  createHash,
  timingSafeEqual,
  randomInt,
} from "node:crypto";
import {
  ApiError,
  profileSelect,
  registered,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";
import {
  tokenHash,
  verifyPassword,
  SESSION_EXPIRES_AT,
} from "./auth.service.js";

const CODE_EXPIRES_AT = 5 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

type Purpose = "enable" | "disable";

const tokenPurpose = {
  enable: "TWO_FACTOR_ENABLE_CODE",
  disable: "TWO_FACTOR_DISABLE_CODE",
} as const;

function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function codeHash(userId: number, purpose: string, code: string) {
  return createHash("sha256")
    .update(`${purpose}:${String(userId)}:${code}`)
    .digest("hex");
}

function sameHash(a: string, b: string) {
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

const isCode = (code: unknown): code is string =>
  typeof code === "string" && /^\d{6}$/.test(code);

function sendCode(ctx: Context, address: string, action: string, code: string) {
  return ctx.mailer.send(
    address,
    `Your WePomodoro ${action} code`,
    `Your ${action} code is ${code}. It expires in ${CODE_EXPIRES_AT / 60_000} minutes.\n` +
      "If you didn't ask for this, you can ignore this email.",
  );
}

// --- Account settings ---------------------------------------------------------

async function requirePassword(ctx: Context, userId: number, value: unknown) {
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (
    typeof value !== "string" ||
    !(await verifyPassword(value, user.passwordHash))
  )
    throw new ApiError(401, "Incorrect password");
  return user;
}

export async function twoFactorStatus(ctx: Context, actor: Actor) {
  const user = await ctx.db.user.findUniqueOrThrow({
    where: { id: registered(actor) },
    select: { twoFactorEnabledAt: true },
  });
  return {
    enabled: Boolean(user.twoFactorEnabledAt),
  };
}

function requireState(
  user: { twoFactorEnabledAt: Date | null },
  purpose: Purpose,
) {
  if (Boolean(user.twoFactorEnabledAt) === (purpose === "enable"))
    throw new ApiError(
      409,
      purpose === "enable"
        ? "Two-factor authentication is already on"
        : "Two-factor authentication is not on",
    );
}

export async function requestToggleCode(
  ctx: Context,
  actor: Actor,
  purpose: Purpose,
  password: unknown,
) {
  const userId = registered(actor);
  const user = await requirePassword(ctx, userId, password);
  requireState(user, purpose);
  const code = generateCode();
  const now = ctx.now();
  await transaction(ctx, async (tx) => {
    await tx.emailToken.deleteMany({
      where: { userId, purpose: tokenPurpose[purpose], usedAt: null },
    });
    await tx.emailToken.create({
      data: {
        userId,
        purpose: tokenPurpose[purpose],
        email: user.email,
        tokenHash: codeHash(userId, purpose, code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CODE_EXPIRES_AT),
      },
    });
  });
  await sendCode(
    ctx,
    user.email,
    purpose === "enable" ? "2FA activation" : "2FA removal",
    code,
  );
}

export async function confirmToggleCode(
  ctx: Context,
  actor: Actor,
  purpose: Purpose,
  input: { password?: unknown; code?: unknown },
) {
  const userId = registered(actor);
  const user = await requirePassword(ctx, userId, input.password);
  requireState(user, purpose);
  const now = ctx.now();
  const done = await transaction(ctx, async (tx) => {
    const row = await tx.emailToken.findFirst({
      where: {
        userId,
        purpose: tokenPurpose[purpose],
        usedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_CODE_ATTEMPTS },
        email: user.email,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return false;
    if (
      !isCode(input.code) ||
      !sameHash(row.tokenHash, codeHash(userId, purpose, input.code))
    ) {
      await tx.emailToken.update({
        where: { id: row.id },
        data: { failedAttempts: { increment: 1 } },
      });
      return false;
    }
    const spent = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count !== 1) return false;
    const enable = purpose === "enable";
    await tx.user.update({
      where: { id: userId },
      data: { twoFactorEnabledAt: enable ? now : null },
    });
    if (!enable) await tx.loginChallenge.deleteMany({ where: { userId } });
    return true;
  });
  if (!done)
    throw new ApiError(400, "Invalid or expired code; request a new one");
}

// --- Login --------------------------------------------------------------------

/** After a correct password: a short-lived challenge instead of a session. */
export async function startChallenge(
  ctx: Context,
  userId: number,
  email: string,
) {
  const bearer = randomBytes(32).toString("base64url");
  const code = generateCode();
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRES_AT);
  await ctx.db.loginChallenge.create({
    data: {
      userId,
      tokenHash: tokenHash(bearer),
      codeHash: codeHash(userId, "login", code),
      createdAt: now,
      expiresAt,
    },
  });
  await sendCode(ctx, email, "login", code);
  return {
    twoFactorRequired: true as const,
    challengeToken: bearer,
    expiresAt,
  };
}

export async function resendChallenge(ctx: Context, challengeToken: unknown) {
  if (typeof challengeToken !== "string" || challengeToken.length > 128)
    throw new ApiError(400, "A challenge token is required");
  const challenge = await ctx.db.loginChallenge.findUnique({
    where: { tokenHash: tokenHash(challengeToken) },
    include: { user: { select: { email: true } } },
  });
  if (!challenge || challenge.expiresAt <= ctx.now())
    throw new ApiError(401, "This login attempt has expired; sign in again");
  const code = generateCode();
  await ctx.db.loginChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: codeHash(challenge.userId, "login", code) },
  });
  await sendCode(ctx, challenge.user.email, "login", code);
}

export async function finishChallenge(
  ctx: Context,
  challengeToken: unknown,
  input: { code?: unknown },
) {
  if (typeof challengeToken !== "string" || challengeToken.length > 128)
    throw new ApiError(400, "A challenge token is required");
  const challenge = await ctx.db.loginChallenge.findUnique({
    where: { tokenHash: tokenHash(challengeToken) },
  });
  if (!challenge || challenge.expiresAt <= ctx.now())
    throw new ApiError(401, "This login attempt has expired; sign in again");
  const codeOk =
    isCode(input.code) &&
    sameHash(
      challenge.codeHash,
      codeHash(challenge.userId, "login", input.code),
    );
  const bearer = randomBytes(32).toString("base64url");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_AT);
  // One transaction: spend the code, consume the challenge, create the session.
  const user = await transaction(ctx, async (tx) => {
    if (!codeOk) return null;
    const consumed = await tx.loginChallenge.deleteMany({
      where: { id: challenge.id },
    });
    if (consumed.count !== 1) return null;
    await tx.authSession.create({
      data: {
        userId: challenge.userId,
        tokenHash: tokenHash(bearer),
        createdAt: now,
        expiresAt,
      },
    });
    return tx.user.findUniqueOrThrow({
      where: { id: challenge.userId },
      select: profileSelect,
    });
  });
  if (user) return { token: bearer, expiresAt, user };
  // Outside the transaction so the count survives; give up after a few misses.
  const failed = await ctx.db.loginChallenge.updateMany({
    where: { id: challenge.id },
    data: { failedAttempts: { increment: 1 } },
  });
  if (failed.count)
    await ctx.db.loginChallenge.deleteMany({
      where: {
        id: challenge.id,
        failedAttempts: { gte: MAX_CODE_ATTEMPTS },
      },
    });
  throw new ApiError(401, "That code is not correct");
}
