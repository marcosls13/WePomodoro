import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  ApiError,
  profileSelect,
  registered,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";
import { tokenHash, verifyPassword } from "./auth.service.js";

const issuer = "WePomodoro";
const stepSeconds = 30;
const challengeMinutes = 5;
const maxChallengeFailures = 5;
const recoveryCodeCount = 10;
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// --- TOTP (RFC 6238: HMAC-SHA1, 30 s step, 6 digits) --------------------------

export function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += base32Alphabet[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    value = (value << 5) | base32Alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const stepOf = (at: Date) =>
  Math.floor(at.getTime() / 1000 / stepSeconds);

export function totp(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

/** The step a code belongs to, allowing one step of clock drift either way. */
function matchStep(secret: Buffer, code: string, now: Date) {
  const current = stepOf(now);
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totp(secret, step));
    const given = Buffer.from(code);
    if (given.length === expected.length && timingSafeEqual(given, expected))
      return step;
  }
  return null;
}

// --- Secret at rest: AES-256-GCM with TWO_FACTOR_KEY --------------------------

function serverKey() {
  const key = Buffer.from(process.env.TWO_FACTOR_KEY ?? "", "base64");
  if (key.length !== 32)
    throw new ApiError(503, "Two-factor authentication is not configured");
  return key;
}

function encrypt(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decrypt(stored: string) {
  const [iv, tag, data] = stored
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", serverKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// --- Recovery codes -----------------------------------------------------------

const normalizeRecovery = (code: string) =>
  code.toLowerCase().replace(/[^0-9a-f]/g, "");

async function replaceRecoveryCodes(
  tx: Transaction,
  userId: number,
  now: Date,
) {
  const plain = Array.from({ length: recoveryCodeCount }, () =>
    randomBytes(8)
      .toString("hex")
      .replace(/(.{4})(?=.)/g, "$1-"),
  );
  await tx.recoveryCode.deleteMany({ where: { userId } });
  await tx.recoveryCode.createMany({
    data: plain.map((code) => ({
      userId,
      codeHash: tokenHash(normalizeRecovery(code)),
      createdAt: now,
    })),
  });
  return plain;
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
  const userId = registered(actor);
  const row = await ctx.db.twoFactor.findUnique({ where: { userId } });
  return {
    enabled: Boolean(row?.enabledAt),
    recoveryCodesLeft: row?.enabledAt
      ? await ctx.db.recoveryCode.count({ where: { userId, usedAt: null } })
      : 0,
  };
}

/** Step 1: make a secret. Not active until a code from the app confirms it. */
export async function startSetup(
  ctx: Context,
  actor: Actor,
  password: unknown,
) {
  const userId = registered(actor);
  const user = await requirePassword(ctx, userId, password);
  const existing = await ctx.db.twoFactor.findUnique({ where: { userId } });
  if (existing?.enabledAt)
    throw new ApiError(409, "Two-factor authentication is already on");
  const secret = randomBytes(20);
  const data = {
    secretCiphertext: encrypt(secret),
    enabledAt: null,
    lastUsedStep: null,
    createdAt: ctx.now(),
  };
  await ctx.db.twoFactor.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  const base32 = base32Encode(secret);
  const label = encodeURIComponent(`${issuer}:${user.username}`);
  return {
    secret: base32,
    otpauthUri: `otpauth://totp/${label}?secret=${base32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${stepSeconds}`,
  };
}

/** Step 2: prove the app works, switch it on and hand out recovery codes once. */
export async function confirmSetup(ctx: Context, actor: Actor, code: unknown) {
  const userId = registered(actor);
  return transaction(ctx, async (tx) => {
    const row = await tx.twoFactor.findUnique({ where: { userId } });
    if (!row) throw new ApiError(409, "Start the setup first");
    if (row.enabledAt)
      throw new ApiError(409, "Two-factor authentication is already on");
    const step =
      typeof code === "string" && /^\d{6}$/.test(code)
        ? matchStep(decrypt(row.secretCiphertext), code, ctx.now())
        : null;
    if (step === null) throw new ApiError(400, "That code is not correct");
    await tx.twoFactor.update({
      where: { userId },
      data: { enabledAt: ctx.now(), lastUsedStep: step },
    });
    return { recoveryCodes: await replaceRecoveryCodes(tx, userId, ctx.now()) };
  });
}

/** Checks a TOTP code or recovery code once; a code can never be reused. */
async function spendSecondFactor(
  tx: Transaction,
  userId: number,
  input: { code?: unknown; recoveryCode?: unknown },
  now: Date,
) {
  if (typeof input.recoveryCode === "string") {
    const used = await tx.recoveryCode.updateMany({
      where: {
        userId,
        usedAt: null,
        codeHash: tokenHash(normalizeRecovery(input.recoveryCode)),
      },
      data: { usedAt: now },
    });
    return used.count === 1;
  }
  const row = await tx.twoFactor.findUnique({ where: { userId } });
  if (
    !row?.enabledAt ||
    typeof input.code !== "string" ||
    !/^\d{6}$/.test(input.code)
  )
    return false;
  const step = matchStep(decrypt(row.secretCiphertext), input.code, now);
  if (step === null) return false;
  // Only a later step than the last accepted one counts, atomically.
  const used = await tx.twoFactor.updateMany({
    where: {
      userId,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
    },
    data: { lastUsedStep: step },
  });
  return used.count === 1;
}

export async function disableTwoFactor(
  ctx: Context,
  actor: Actor,
  input: { password?: unknown; code?: unknown; recoveryCode?: unknown },
) {
  const userId = registered(actor);
  await requirePassword(ctx, userId, input.password);
  await transaction(ctx, async (tx) => {
    const row = await tx.twoFactor.findUnique({ where: { userId } });
    if (!row?.enabledAt)
      throw new ApiError(409, "Two-factor authentication is not on");
    if (!(await spendSecondFactor(tx, userId, input, ctx.now())))
      throw new ApiError(401, "That code is not correct");
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.twoFactor.delete({ where: { userId } });
  });
}

export async function regenerateRecoveryCodes(
  ctx: Context,
  actor: Actor,
  password: unknown,
) {
  const userId = registered(actor);
  await requirePassword(ctx, userId, password);
  return transaction(ctx, async (tx) => {
    const row = await tx.twoFactor.findUnique({ where: { userId } });
    if (!row?.enabledAt)
      throw new ApiError(409, "Two-factor authentication is not on");
    return { recoveryCodes: await replaceRecoveryCodes(tx, userId, ctx.now()) };
  });
}

// --- Login --------------------------------------------------------------------

/** After a correct password: a short-lived challenge instead of a session. */
export async function startChallenge(ctx: Context, userId: number) {
  const bearer = randomBytes(32).toString("base64url");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + challengeMinutes * 60_000);
  await ctx.db.loginChallenge.create({
    data: { userId, tokenHash: tokenHash(bearer), createdAt: now, expiresAt },
  });
  return {
    twoFactorRequired: true as const,
    challengeToken: bearer,
    expiresAt,
  };
}

export async function finishChallenge(
  ctx: Context,
  challengeToken: unknown,
  input: { code?: unknown; recoveryCode?: unknown },
) {
  if (typeof challengeToken !== "string" || challengeToken.length > 128)
    throw new ApiError(400, "A challenge token is required");
  const challenge = await ctx.db.loginChallenge.findUnique({
    where: { tokenHash: tokenHash(challengeToken) },
  });
  if (!challenge || challenge.expiresAt <= ctx.now())
    throw new ApiError(401, "This login attempt has expired; sign in again");
  const bearer = randomBytes(32).toString("base64url");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + 7 * 86400000);
  // One transaction: spend the code, consume the challenge, create the session.
  const user = await transaction(ctx, async (tx) => {
    if (!(await spendSecondFactor(tx, challenge.userId, input, now)))
      return null;
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
        failedAttempts: { gte: maxChallengeFailures },
      },
    });
  throw new ApiError(401, "That code is not correct");
}
