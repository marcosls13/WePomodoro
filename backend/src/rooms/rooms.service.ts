import { randomBytes } from "node:crypto";
import {
  ApiError,
  identity,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";
import {
  activeMember,
  available,
  cancelTimer,
  dropMember,
  lockSession,
  ownerMember,
  settle,
  timerView,
} from "../timers/timers.service.js";

export interface SessionSettings {
  name?: string;
  focusSeconds?: number;
  breakSeconds?: number;
}

function isUniqueClash(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function sessionView(
  tx: Transaction,
  actor: Actor,
  sessionId: string,
  now: Date,
) {
  const found = await tx.pomodoroSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const session = await settle(tx, found, now);
  const members = await tx.sessionMember.findMany({
    where: {
      sessionId,
      OR: [
        { userId: { not: null } },
        { guestSession: { expiresAt: { gt: now } } },
      ],
    },
    select: {
      id: true,
      userId: true,
      guestSessionId: true,
      joinedAt: true,
      mutedUntil: true,
      isOwner: true,
      user: { select: { username: true } },
      guestSession: { select: { displayName: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  return {
    ...timerView(session, now),
    members: members.map(({ user, guestSession, ...member }) => ({
      ...member,
      isGuest: member.userId === null,
      // Lets the client tell which member is the caller.
      isMe:
        (actor.userId !== null && member.userId === actor.userId) ||
        (actor.guestSessionId !== null &&
          member.guestSessionId === actor.guestSessionId),
      displayName: user?.username ?? guestSession?.displayName,
    })),
  };
}

const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// 8 random characters; a clash with another room fails on the unique index and
// createRoom retries, so no lookup is needed here.
function newRoomCode() {
  return Array.from(
    randomBytes(8),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}

/** The owner replaces the session code; the old one stops working at once. */
export async function rotateCode(
  ctx: Context,
  actor: Actor,
  sessionId: string,
) {
  return transaction(ctx, async (tx) => {
    const session = await lockSession(tx, sessionId);
    await ownerMember(tx, actor, sessionId);
    if (!session.code) throw new ApiError(409, "A solo timer has no code");
    for (let attempt = 0; ; attempt++)
      try {
        return {
          code: (
            await tx.pomodoroSession.update({
              where: { id: sessionId },
              data: { code: newRoomCode() },
            })
          ).code,
        };
      } catch (error) {
        if (!(attempt < 3 && isUniqueClash(error))) throw error;
      }
  });
}

/** Anyone, guests included, can create a session. `solo` makes one with no code. */
export async function createSession(
  ctx: Context,
  actor: Actor,
  input: SessionSettings & { name: string; solo?: boolean },
) {
  const { solo, ...settings } = input;
  for (let attempt = 0; ; attempt++) {
    try {
      return await transaction(ctx, async (tx) => {
        const now = ctx.now();
        const session = await tx.pomodoroSession.create({
          data: {
            ...settings,
            code: solo ? null : newRoomCode(),
            createdAt: now,
            members: {
              create: {
                ...identity(actor),
                isOwner: true,
                joinedAt: now,
                creditedAt: now,
              },
            },
          },
        });
        return sessionView(tx, actor, session.id, now);
      });
    } catch (error) {
      if (attempt < 3 && isUniqueClash(error)) continue;
      throw error;
    }
  }
}

export async function listSessions(ctx: Context, actor: Actor) {
  // Only sessions this identity belongs to; the code is only shown to members.
  return ctx.db.pomodoroSession.findMany({
    where: { members: { some: identity(actor) } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getSession(
  ctx: Context,
  actor: Actor,
  sessionId: string,
) {
  return transaction(ctx, async (tx) => {
    await lockSession(tx, sessionId);
    await activeMember(tx, actor, sessionId);
    return sessionView(tx, actor, sessionId, ctx.now());
  });
}

export async function joinSession(ctx: Context, actor: Actor, code: string) {
  return transaction(ctx, async (tx) => {
    const found = await tx.pomodoroSession.findUnique({ where: { code } });
    if (!found) throw new ApiError(404, "Session code not found");
    // Recheck after taking the lock in case the code was just replaced.
    const session = await lockSession(tx, found.id);
    if (session.code !== code)
      throw new ApiError(404, "Session code not found");
    const now = ctx.now();
    await addMember(tx, session.id, actor, now);
    return sessionView(tx, actor, session.id, now);
  });
}

/**
 * Adds a member. Joining a live timer means being in it, so the person must not
 * be in another live timer. Already a member (code used before): nothing to do.
 */
export async function addMember(
  tx: Transaction,
  sessionId: string,
  actor: Actor,
  now: Date,
) {
  const member = await tx.sessionMember.findFirst({
    where: { sessionId, ...identity(actor) },
  });
  if (member) return;
  const session = await settle(tx, await lockSession(tx, sessionId), now);
  if (session.timerStatus !== "IDLE")
    await available(tx, actor, now, sessionId);
  await tx.sessionMember.create({
    data: { sessionId, ...identity(actor), joinedAt: now, creditedAt: now },
  });
}

/** Leaving is allowed for the owner too: the next member takes over. */
export async function leaveSession(
  ctx: Context,
  actor: Actor,
  sessionId: string,
) {
  return transaction(ctx, async (tx) => {
    const session = await lockSession(tx, sessionId);
    const member = await activeMember(tx, actor, sessionId);
    await dropMember(tx, session, member, ctx.now());
  });
}

export async function updateSession(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  settings: SessionSettings,
) {
  return transaction(ctx, async (tx) => {
    const session = await lockSession(tx, sessionId);
    await ownerMember(tx, actor, sessionId);
    // A running phase keeps its length: settings change between phases only.
    const settled = await settle(tx, session, ctx.now());
    if (settled.timerStatus !== "IDLE")
      throw new ApiError(409, "Settings can only change between phases");
    return tx.pomodoroSession.update({
      where: { id: sessionId },
      data: settings,
    });
  });
}

export async function transferOwner(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  newOwnerMemberId: string,
) {
  return transaction(ctx, async (tx) => {
    await lockSession(tx, sessionId);
    const owner = await ownerMember(tx, actor, sessionId);
    const target = await tx.sessionMember.findFirst({
      where: { id: newOwnerMemberId, sessionId },
    });
    if (!target) throw new ApiError(400, "The new owner must be a member");
    // Clear the old flag first: at most one owner at any moment.
    await tx.sessionMember.update({
      where: { id: owner.id },
      data: { isOwner: false },
    });
    await tx.sessionMember.update({
      where: { id: target.id },
      data: { isOwner: true },
    });
    return tx.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } });
  });
}

export async function deleteSession(
  ctx: Context,
  actor: Actor,
  sessionId: string,
) {
  await transaction(ctx, async (tx) => {
    const session = await lockSession(tx, sessionId);
    await ownerMember(tx, actor, sessionId);
    // Credit the focus time in progress before the members go with it (cascade).
    await cancelTimer(tx, session, ctx.now());
    await tx.pomodoroSession.delete({ where: { id: sessionId } });
  });
}

/**
 * Who may moderate a session: its owner, or a moderator/admin who is a member.
 * Returns the capacity so callers can protect staff from moderators.
 */
export async function moderatorOf(
  tx: Transaction,
  actor: Actor,
  sessionId: string,
) {
  const member = await tx.sessionMember.findFirst({
    where: { sessionId, ...identity(actor) },
  });
  if (member?.isOwner) return "OWNER" as const;
  if (member?.userId) {
    const user = await tx.user.findUnique({
      where: { id: member.userId },
      select: { role: true },
    });
    if (user && user.role !== "USER") return user.role;
  }
  throw new ApiError(403, "Only the owner or a moderator can do this");
}

// Moderators can't act on other staff; only the owner or an admin can.
async function protectStaff(
  tx: Transaction,
  by: Awaited<ReturnType<typeof moderatorOf>>,
  targetUserId: number | null,
) {
  if (by !== "MODERATOR" || targetUserId === null) return;
  const target = await tx.user.findUnique({
    where: { id: targetUserId },
    select: { role: true },
  });
  if (target?.role !== "USER")
    throw new ApiError(403, "Moderators can't act on other staff");
}

/** Owner or moderator kicks a member, who can rejoin with the code. */
export async function removeMember(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  memberId: string,
) {
  return transaction(ctx, async (tx) => {
    const session = await lockSession(tx, sessionId);
    const by = await moderatorOf(tx, actor, sessionId);
    const member = await tx.sessionMember.findFirst({
      where: { id: memberId, sessionId },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.isOwner) throw new ApiError(409, "The owner cannot be removed");
    await protectStaff(tx, by, member.userId);
    await dropMember(tx, session, member, ctx.now());
  });
}

/** Owner or moderator mutes a member for `minutes`, or unmutes with `null`. */
export async function muteMember(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  memberId: string,
  minutes: number | null,
) {
  return transaction(ctx, async (tx) => {
    await lockSession(tx, sessionId);
    const by = await moderatorOf(tx, actor, sessionId);
    const member = await tx.sessionMember.findFirst({
      where: { id: memberId, sessionId },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.isOwner) throw new ApiError(409, "The owner cannot be muted");
    await protectStaff(tx, by, member.userId);
    const mutedUntil =
      minutes === null ? null : new Date(ctx.now().getTime() + minutes * 60000);
    await tx.sessionMember.update({
      where: { id: memberId },
      data: { mutedUntil },
    });
    return { mutedUntil };
  });
}
