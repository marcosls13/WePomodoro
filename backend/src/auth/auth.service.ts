import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import {
  ApiError,
  identity,
  profileSelect,
  registered,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";

export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    throw new ApiError(400, "Password must be 8–128 characters");
  return value;
}

function derive(value: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      value,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(value, salt)).toString("hex")}`;
}

const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
export async function verifyPassword(value: string, hash: string | null) {
  const [algorithm, salt, key] = (hash ?? dummyHash).split("$");
  if (algorithm !== "scrypt" || !salt || !key || !/^[0-9a-f]{128}$/.test(key))
    return false;
  const actual = await derive(value, salt);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function token() {
  return randomBytes(32).toString("base64url");
}

export async function signup(
  ctx: Context,
  input: { email: string; username: string; password: string },
) {
  const hash = await hashPassword(input.password);
  const bearer = token();
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + 7 * 86400000);
  const user = await transaction(ctx, async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash: hash,
      },
      select: profileSelect,
    });
    await tx.authSession.create({
      data: {
        userId: created.id,
        tokenHash: tokenHash(bearer),
        createdAt: now,
        expiresAt,
      },
    });
    return created;
  });
  return { token: bearer, expiresAt, user };
}

export async function login(ctx: Context, address: string, value: string) {
  const user = await ctx.db.user.findUnique({ where: { username: address } });
  const valid = await verifyPassword(value, user?.passwordHash ?? null);
  if (!user || !valid) throw new ApiError(401, "Invalid username or password");
  const bearer = token();
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + 7 * 86400000);
  // Check the hash again inside the write transaction to avoid a password-change race.
  const profile = await transaction(ctx, async (tx) => {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (current?.passwordHash !== user.passwordHash)
      throw new ApiError(401, "Invalid username or password");
    await tx.authSession.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(bearer),
        createdAt: now,
        expiresAt,
      },
    });
    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: profileSelect,
    });
  });
  return { token: bearer, expiresAt, user: profile };
}

export async function createGuest(ctx: Context, displayName: string) {
  const bearer = token();
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + 86400000);
  const guest = await ctx.db.guestSession.create({
    data: {
      displayName,
      tokenHash: tokenHash(bearer),
      createdAt: now,
      expiresAt,
    },
    select: { id: true, displayName: true, expiresAt: true },
  });
  return { token: bearer, guest };
}

export async function authenticate(ctx: Context, req: Request): Promise<Actor> {
  const authorization = req.headers.authorization;
  if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))
    throw new ApiError(401, "A valid Bearer token is required");
  const hash = tokenHash(authorization.slice(7));
  const session = await ctx.db.authSession.findUnique({
    where: { tokenHash: hash },
  });
  if (session && session.expiresAt > ctx.now())
    return {
      userId: session.userId,
      guestSessionId: null,
      authSessionId: session.id,
    };
  const guest = await ctx.db.guestSession.findUnique({
    where: { tokenHash: hash },
  });
  if (guest && guest.expiresAt > ctx.now())
    return { userId: null, guestSessionId: guest.id };
  throw new ApiError(401, "Session expired or invalid");
}

export async function me(ctx: Context, actor: Actor) {
  if (actor.userId !== null)
    return {
      type: "user",
      profile: await ctx.db.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: profileSelect,
      }),
    };
  return {
    type: "guest",
    profile: await ctx.db.guestSession.findUniqueOrThrow({
      where: { id: actor.guestSessionId ?? "" },
      select: { id: true, displayName: true, expiresAt: true },
    }),
  };
}

export async function updateProfile(
  ctx: Context,
  actor: Actor,
  input: {
    email?: string;
    username?: string;
    password?: string;
    currentPassword?: string;
  },
) {
  const userId = registered(actor);
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (
    (input.email !== undefined || input.password !== undefined) &&
    (!input.currentPassword ||
      !(await verifyPassword(input.currentPassword, user.passwordHash)))
  )
    throw new ApiError(401, "Current password is required");
  const newHash =
    input.password === undefined
      ? undefined
      : await hashPassword(input.password);
  return transaction(ctx, async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (current.passwordHash !== user.passwordHash)
      throw new ApiError(409, "Profile changed; please try again");
    const profile = await tx.user.update({
      where: { id: userId },
      data: {
        email: input.email,
        username: input.username,
        passwordHash: newHash,
      },
      select: profileSelect,
    });
    if (newHash)
      await tx.authSession.deleteMany({
        where: { userId, id: { not: actor.authSessionId } },
      });
    return profile;
  });
}
// Only server-validated actor identities are allowed into the API services.
export { identity };
