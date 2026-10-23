import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  ApiError,
  email,
  profileSelect,
  transaction,
  type Context,
  type Transaction,
} from "../api/common.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  SESSION_EXPIRES_AT,
  VERIFY_WINDOW_MS,
  tokenHash,
} from "./auth.service.js";
import type { OAuthProfile, OAuthProviderConfig } from "./oauth.providers.js";
import { sendVerificationCode } from "./verify.service.js";

// How long the one-time code can be swapped for a session.
const CODE_TTL_MS = 60_000;

// Why a sign-in failed; the callback route turns it into `?error=<code>`.
export class OAuthError extends Error {
  constructor(public code: "state" | "denied" | "no_email" | "email_taken") {
    super(code);
  }
}

// Looks up an enabled provider by id, or fails with a 404.
function provider(ctx: Context, id: unknown) {
  const found = typeof id === "string" ? ctx.oauth.get(id) : undefined;
  if (!found) throw new ApiError(404, "Unknown sign-in provider");
  return found;
}

// Constant-time comparison of two strings (the state cookie and the state query).
function sameText(a: unknown, b: unknown) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.length > 0 &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}

// Validates and lowercases the provider's email; a missing or invalid one means `no_email`.
function cleanEmail(value: string | null) {
  try {
    return email(value);
  } catch {
    throw new OAuthError("no_email");
  }
}

// Builds a valid username from the provider's login; after a clash it adds a
// random suffix.
function candidate(login: string, attempt: number) {
  const name = login
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32)
    .padEnd(3, "_");
  return attempt === 0
    ? name
    : `${name.slice(0, 27)}_${randomBytes(2).toString("hex")}`;
}

// Makes a random state and the provider's authorize URL; the route keeps the
// state in a cookie to check it on the way back.
export function oauthStart(ctx: Context, id: unknown) {
  const state = randomBytes(32).toString("base64url");
  return { url: provider(ctx, id).authorizeUrl(state), state };
}

// Finds or creates the user for a provider profile. It never links an email the
// provider doesn't vouch for, and replaces a fresh unverified signup on that email.
async function resolveUser(
  ctx: Context,
  tx: Transaction,
  found: OAuthProviderConfig,
  profile: OAuthProfile,
  mail: string,
  attempt: number,
) {
  const account = {
    provider: found.dbValue,
    providerUserId: profile.providerUserId,
  };
  const linked = await tx.oAuthAccount.findUnique({
    where: { provider_providerUserId: account },
  });
  if (linked) return { userId: linked.userId, needsVerification: false };
  const existing = await tx.user.findUnique({ where: { email: mail } });
  if (existing) {
    if (!profile.emailVerified) throw new OAuthError("email_taken");
    if (existing.emailVerifiedAt) {
      const other = await tx.oAuthAccount.findUnique({
        where: {
          userId_provider: { userId: existing.id, provider: found.dbValue },
        },
      });
      if (other) throw new OAuthError("email_taken");
      await tx.oAuthAccount.create({
        data: { userId: existing.id, ...account },
      });
      return { userId: existing.id, needsVerification: false };
    }
    // Unverified with no deadline is an older account that may hold data.
    if (!existing.verifyBy) throw new OAuthError("email_taken");
    await tx.user.delete({ where: { id: existing.id } });
  }
  const now = ctx.now();
  const created = await tx.user.create({
    data: {
      email: mail,
      username: candidate(profile.login, attempt),
      emailVerifiedAt: profile.emailVerified ? now : null,
      verifyBy: profile.emailVerified
        ? null
        : new Date(now.getTime() + VERIFY_WINDOW_MS),
      oAuthAccounts: { create: account },
    },
  });
  return { userId: created.id, needsVerification: !profile.emailVerified };
}

// Checks the state, loads the profile, resolves the user (retrying on a username
// clash) and returns the one-time code to send back to the frontend.
export async function oauthCallback(
  ctx: Context,
  id: unknown,
  code: unknown,
  cookieState: string | undefined,
  queryState: unknown,
) {
  const found = provider(ctx, id);
  if (!sameText(cookieState, queryState)) throw new OAuthError("state");
  if (typeof code !== "string" || !code || code.length > 2048)
    throw new OAuthError("denied");
  const profile = await found.profile(code);
  const mail = cleanEmail(profile.email);
  const result = await (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await transaction(ctx, (tx) =>
          resolveUser(ctx, tx, found, profile, mail, attempt),
        );
      } catch (error) {
        if (
          attempt < 4 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          continue;
        throw error;
      }
    }
  })();
  if (result.needsVerification) await sendVerificationCode(ctx, result.userId);
  const oneTime = randomBytes(32).toString("base64url");
  const now = ctx.now();
  await ctx.db.oAuthCode.create({
    data: {
      userId: result.userId,
      codeHash: tokenHash(oneTime),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
  });
  return oneTime;
}

// Swaps a one-time code for a session, like a password login. A code works once.
export async function oauthExchange(ctx: Context, code: unknown) {
  if (typeof code !== "string" || !code || code.length > 128)
    throw new ApiError(400, "A code is required");
  const expired = () =>
    new ApiError(401, "This sign-in has expired; try again");
  const row = await ctx.db.oAuthCode.findUnique({
    where: { codeHash: tokenHash(code) },
  });
  if (!row || row.expiresAt <= ctx.now()) throw expired();
  const bearer = randomBytes(32).toString("base64url");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_AT);
  const user = await transaction(ctx, async (tx) => {
    const spent = await tx.oAuthCode.deleteMany({ where: { id: row.id } });
    if (spent.count !== 1) return null;
    await tx.authSession.create({
      data: {
        userId: row.userId,
        tokenHash: tokenHash(bearer),
        createdAt: now,
        expiresAt,
      },
    });
    return tx.user.findUniqueOrThrow({
      where: { id: row.userId },
      select: profileSelect,
    });
  });
  if (!user) throw expired();
  return { token: bearer, expiresAt, user };
}
