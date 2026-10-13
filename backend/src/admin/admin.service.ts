import {
  ApiError,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";
import { endIdentity } from "../api/lifecycle.js";
import { hashPassword } from "../auth/auth.service.js";
import { sendVerificationCode } from "../auth/verify.service.js";
import type { Role } from "../generated/prisma/client.js";

/** Returns the caller's role; moderators only pass when `readOnly`. */
export async function requireStaff(
  ctx: Context,
  actor: Actor,
  readOnly: boolean,
) {
  const user =
    actor.userId === null
      ? null
      : await ctx.db.user.findUnique({
          where: { id: actor.userId },
          select: { role: true },
        });
  if (user?.role === "ADMIN" || (readOnly && user?.role === "MODERATOR"))
    return user.role;
  throw new ApiError(403, "Administrator access required");
}

const adminSelect = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  twoFactor: { select: { enabledAt: true } },
} as const;

function view<
  T extends {
    email: string;
    emailVerifiedAt: Date | null;
    twoFactor: { enabledAt: Date | null } | null;
  },
>(user: T, full = true) {
  const { twoFactor, email, emailVerifiedAt, ...rest } = user;
  // Moderators see who is who, not private account details.
  return full
    ? {
        ...rest,
        email,
        emailVerifiedAt,
        twoFactorEnabled: Boolean(twoFactor?.enabledAt),
      }
    : rest;
}

export async function listUsers(
  ctx: Context,
  page: { skip: number; take: number },
  q: string | undefined,
  full: boolean,
) {
  const users = await ctx.db.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    ...page,
    select: adminSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return users.map((user) => view(user, full));
}

export async function getUser(ctx: Context, id: number, full: boolean) {
  const user = await ctx.db.user.findUnique({
    where: { id },
    select: adminSelect,
  });
  if (!user) throw new ApiError(404, "User not found");
  return view(user, full);
}

/** An admin creates an account directly; the email counts as verified. */
export async function createUser(
  ctx: Context,
  input: { username: string; email: string; password: string; role: Role },
) {
  const { password, ...rest } = input;
  const created = await ctx.db.user.create({
    data: {
      ...rest,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: ctx.now(),
    },
    select: adminSelect,
  });
  return view(created);
}

/** Someone must always be able to administer, so the last admin can't be removed. */
async function keepAnAdmin(
  tx: { user: Context["db"]["user"] },
  leaving: number,
) {
  if (
    (await tx.user.count({
      where: { role: "ADMIN", id: { not: leaving } },
    })) === 0
  )
    throw new ApiError(409, "At least one administrator must remain");
}

export async function updateUser(
  ctx: Context,
  id: number,
  input: {
    username?: string;
    email?: string;
    role?: Role;
    password?: string;
  },
) {
  const { password, ...profile } = input;
  const passwordHash = password ? await hashPassword(password) : undefined;
  const updated = await transaction(ctx, async (tx) => {
    const current = await tx.user.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "User not found");
    if (
      input.role !== undefined &&
      input.role !== "ADMIN" &&
      current.role === "ADMIN"
    )
      await keepAnAdmin(tx, id);
    const emailChanged =
      input.email !== undefined && input.email !== current.email;
    // A new password signs the user out everywhere, including pending 2FA logins.
    if (passwordHash) {
      await tx.authSession.deleteMany({ where: { userId: id } });
      await tx.loginChallenge.deleteMany({ where: { userId: id } });
    }
    return tx.user.update({
      where: { id },
      data: {
        ...profile,
        passwordHash,
        // A new address hasn't been proven yet.
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
      select: adminSelect,
    });
  });
  if (input.email !== undefined && !updated.emailVerifiedAt)
    await sendVerificationCode(ctx, id);
  return view(updated);
}

export async function deleteUser(ctx: Context, actor: Actor, id: number) {
  if (id === actor.userId)
    throw new ApiError(409, "Delete your own account from your profile");
  await endIdentity(ctx, { userId: id, guestSessionId: null }, true);
}

/** For a user who lost both their authenticator and recovery codes. */
export async function resetTwoFactor(ctx: Context, id: number) {
  await transaction(ctx, async (tx) => {
    const { count } = await tx.twoFactor.deleteMany({ where: { userId: id } });
    if (!count)
      throw new ApiError(404, "Two-factor is not set up for this user");
    await tx.recoveryCode.deleteMany({ where: { userId: id } });
    await tx.loginChallenge.deleteMany({ where: { userId: id } });
  });
}
