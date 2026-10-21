import { randomBytes } from "node:crypto";
import {
  ApiError,
  identity,
  registered,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";
import {
  activeMember,
  attend,
  cancelRoomTimer,
  leaveTimer,
  liveStatuses,
  lockRoom,
  settle,
  timerView,
} from "../timers/timers.service.js";

export interface RoomSettings {
  name?: string;
  focusSeconds?: number;
  shortBreakSeconds?: number;
  longBreakSeconds?: number;
  cyclesBeforeLongBreak?: number;
}

async function roomView(tx: Transaction, roomId: string, now: Date) {
  const room = await tx.studyRoom.findUniqueOrThrow({ where: { id: roomId } });
  const members = await tx.roomMember.findMany({
    where: {
      roomId,
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
      invitedById: true,
      mutedUntil: true,
      user: { select: { username: true } },
      guestSession: { select: { displayName: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  const session = await tx.pomodoroSession.findFirst({
    where: { roomId, status: { in: [...liveStatuses] } },
  });
  const current = session ? await settle(tx, session, now) : null;
  return {
    ...room,
    members: members.map(({ user, guestSession, ...member }) => ({
      ...member,
      isGuest: member.userId === null,
      displayName: user?.username ?? guestSession?.displayName,
    })),
    timer: current ? timerView(current, now) : null,
  };
}

const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Random code that starts at 6 characters and gets one longer whenever a length
// keeps colliding, so it scales with the number of invites without a fixed size.
async function newInviteCode(tx: Transaction) {
  for (let length = 6; ; length++)
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = Array.from(
        randomBytes(length),
        (byte) => alphabet[byte % alphabet.length],
      ).join("");
      if (!(await tx.invite.findUnique({ where: { code } }))) return code;
    }
}

/** The caller's own join code for a room; `rotate` replaces it with a new one. */
export async function getInvite(
  ctx: Context,
  actor: Actor,
  roomId: string,
  rotate: boolean,
) {
  const createdById = registered(actor);
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    await activeMember(tx, actor, roomId);
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const key = { roomId_createdById: { roomId, createdById } };
    const existing = await tx.invite.findUnique({ where: key });
    if (existing && !rotate) return { inviteCode: existing.code };
    const code = await newInviteCode(tx);
    const invite = await tx.invite.upsert({
      where: key,
      create: { roomId, createdById, code, createdAt: ctx.now() },
      update: { code },
    });
    return { inviteCode: invite.code };
  });
}

export async function createRoom(
  ctx: Context,
  actor: Actor,
  settings: RoomSettings & { name: string },
) {
  const ownerId = registered(actor);
  for (let attempt = 0; ; attempt++) {
    try {
      return await transaction(ctx, async (tx) => {
        const now = ctx.now();
        const room = await tx.studyRoom.create({
          data: {
            ...settings,
            ownerId,
            createdAt: now,
            members: { create: { userId: ownerId, joinedAt: now } },
          },
        });
        return roomView(tx, room.id, now);
      });
    } catch (error) {
      if (
        attempt < 3 &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
  }
}

export async function listRooms(ctx: Context, actor: Actor) {
  // Only rooms this identity currently belongs to; invite codes aren't public.
  return ctx.db.studyRoom.findMany({
    where: {
      closedAt: null,
      members: { some: identity(actor) },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getRoom(ctx: Context, actor: Actor, roomId: string) {
  return transaction(ctx, async (tx) => {
    await lockRoom(tx, roomId);
    await activeMember(tx, actor, roomId);
    return roomView(tx, roomId, ctx.now());
  });
}

export async function joinRoom(ctx: Context, actor: Actor, code: string) {
  return transaction(ctx, async (tx) => {
    const found = await tx.invite.findUnique({ where: { code } });
    if (!found) throw new ApiError(404, "Invite code not found");
    const room = await lockRoom(tx, found.roomId);
    // Recheck after taking the lock in case the invite was rotated or revoked.
    if (!(await tx.invite.findUnique({ where: { code } })))
      throw new ApiError(404, "Invite code not found");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const now = ctx.now();
    await addMember(tx, room.id, actor, now, found.createdById);
    return roomView(tx, room.id, now);
  });
}

/**
 * Adds a member and joins a running timer. Already a member (code used before):
 * nothing to do; a running timer is then joined through the timer's own action.
 */
export async function addMember(
  tx: Transaction,
  roomId: string,
  actor: Actor,
  now: Date,
  invitedById: number,
) {
  const member = await tx.roomMember.findFirst({
    where: { roomId, ...identity(actor) },
  });
  if (member) return;
  if (
    actor.userId !== null &&
    (await tx.roomBan.findUnique({
      where: { roomId_userId: { roomId, userId: actor.userId } },
    }))
  )
    throw new ApiError(403, "You are banned from this room");
  await tx.roomMember.create({
    data: { roomId, ...identity(actor), joinedAt: now, invitedById },
  });
  const session = await tx.pomodoroSession.findFirst({
    where: { roomId, status: { in: [...liveStatuses] } },
  });
  if (session) {
    const current = await settle(tx, session, now);
    if (liveStatuses.includes(current.status as "ACTIVE" | "PAUSED"))
      await attend(tx, actor, current, now);
  }
}

export async function leaveRoom(ctx: Context, actor: Actor, roomId: string) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId === actor.userId && !room.closedAt)
      throw new ApiError(
        409,
        "Transfer ownership or close the room before leaving",
      );
    const member = await activeMember(tx, actor, roomId);
    const now = ctx.now();
    const session = await tx.pomodoroSession.findFirst({
      where: { roomId, status: { in: [...liveStatuses] } },
    });
    if (session)
      await leaveTimer(tx, actor, await settle(tx, session, now), now);
    await tx.roomMember.delete({ where: { id: member.id } });
    // A member who left can no longer invite others.
    await tx.invite.deleteMany({
      where: { roomId, createdById: actor.userId ?? -1 },
    });
  });
}

export async function updateRoom(
  ctx: Context,
  actor: Actor,
  roomId: string,
  settings: RoomSettings,
) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can change room settings");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    return tx.studyRoom.update({ where: { id: roomId }, data: settings });
  });
}

export async function manageRoom(
  ctx: Context,
  actor: Actor,
  roomId: string,
  action: "close" | "transfer",
  newOwnerId?: number,
) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can manage the room");
    if (action === "close") {
      await cancelRoomTimer(tx, roomId, ctx.now());
      return tx.studyRoom.update({
        where: { id: roomId },
        data: { closedAt: room.closedAt ?? ctx.now() },
      });
    }
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const member = await tx.roomMember.findFirst({
      where: { roomId, userId: newOwnerId },
    });
    if (!member?.userId)
      throw new ApiError(
        400,
        "The new owner must be an active registered member",
      );
    return tx.studyRoom.update({
      where: { id: roomId },
      data: { ownerId: member.userId },
    });
  });
}

export async function deleteRoom(ctx: Context, actor: Actor, roomId: string) {
  await transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can delete the room");
    await cancelRoomTimer(tx, roomId, ctx.now());
    await tx.studyRoom.delete({ where: { id: roomId } });
  });
}

/**
 * Who may moderate a room: its owner, or a moderator/admin who is a member of
 * it. Returns the capacity so callers can protect staff from moderators.
 */
export async function moderatorOf(
  tx: Transaction,
  actor: Actor,
  room: { id: string; ownerId: number },
) {
  if (room.ownerId === actor.userId) return "OWNER" as const;
  if (actor.userId !== null) {
    const user = await tx.user.findUnique({
      where: { id: actor.userId },
      select: { role: true },
    });
    if (
      user &&
      user.role !== "USER" &&
      (await tx.roomMember.findFirst({
        where: { roomId: room.id, userId: actor.userId },
      }))
    )
      return user.role;
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

/** Owner or moderator kicks a member; with `ban`, a registered user also can't come back. */
export async function removeMember(
  ctx: Context,
  actor: Actor,
  roomId: string,
  memberId: string,
  ban?: { reason: string | null },
) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    const by = await moderatorOf(tx, actor, room);
    const member = await tx.roomMember.findFirst({
      where: { id: memberId, roomId },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.userId === room.ownerId)
      throw new ApiError(409, "The owner cannot be removed");
    await protectStaff(tx, by, member.userId);
    const now = ctx.now();
    const session = await tx.pomodoroSession.findFirst({
      where: { roomId, status: { in: [...liveStatuses] } },
    });
    if (session)
      await leaveTimer(tx, member, await settle(tx, session, now), now);
    await tx.roomMember.delete({ where: { id: memberId } });
    if (member.userId) {
      await tx.invite.deleteMany({
        where: { roomId, createdById: member.userId },
      });
      if (ban)
        await tx.roomBan.upsert({
          where: { roomId_userId: { roomId, userId: member.userId } },
          create: {
            roomId,
            userId: member.userId,
            reason: ban.reason,
            createdAt: now,
          },
          update: { reason: ban.reason },
        });
    }
  });
}

async function moderatedRoom(tx: Transaction, actor: Actor, roomId: string) {
  const room = await lockRoom(tx, roomId);
  return { room, by: await moderatorOf(tx, actor, room) };
}

export async function listBans(ctx: Context, actor: Actor, roomId: string) {
  return transaction(ctx, async (tx) => {
    await moderatedRoom(tx, actor, roomId);
    const bans = await tx.roomBan.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { username: true } } },
    });
    return bans.map(({ user, ...ban }) => ({
      ...ban,
      username: user.username,
    }));
  });
}

export async function unban(
  ctx: Context,
  actor: Actor,
  roomId: string,
  userId: number,
) {
  return transaction(ctx, async (tx) => {
    await moderatedRoom(tx, actor, roomId);
    const { count } = await tx.roomBan.deleteMany({
      where: { roomId, userId },
    });
    if (!count) throw new ApiError(404, "Ban not found");
  });
}

/** Owner or moderator mutes a member for `minutes`, or unmutes with `null`. */
export async function muteMember(
  ctx: Context,
  actor: Actor,
  roomId: string,
  memberId: string,
  minutes: number | null,
) {
  return transaction(ctx, async (tx) => {
    const { room, by } = await moderatedRoom(tx, actor, roomId);
    const member = await tx.roomMember.findFirst({
      where: { id: memberId, roomId },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.userId === room.ownerId)
      throw new ApiError(409, "The owner cannot be muted");
    await protectStaff(tx, by, member.userId);
    const mutedUntil =
      minutes === null ? null : new Date(ctx.now().getTime() + minutes * 60000);
    await tx.roomMember.update({
      where: { id: memberId },
      data: { mutedUntil },
    });
    return { mutedUntil };
  });
}
