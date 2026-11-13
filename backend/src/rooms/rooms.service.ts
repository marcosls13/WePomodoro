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

function isUniqueClash(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
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

// 8 random characters; a clash with another room fails on the unique index and
// createRoom retries, so no lookup is needed here.
function newRoomCode() {
  return Array.from(
    randomBytes(8),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}

/** The owner replaces the room code; the old one stops working at once. */
export async function rotateCode(ctx: Context, actor: Actor, roomId: string) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can change the room code");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    for (let attempt = 0; ; attempt++)
      try {
        return {
          roomCode: (
            await tx.studyRoom.update({
              where: { id: roomId },
              data: { code: newRoomCode() },
            })
          ).code,
        };
      } catch (error) {
        if (!(attempt < 3 && isUniqueClash(error))) throw error;
      }
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
            code: newRoomCode(),
            ownerId,
            createdAt: now,
            members: { create: { userId: ownerId, joinedAt: now } },
          },
        });
        return roomView(tx, room.id, now);
      });
    } catch (error) {
      if (attempt < 3 && isUniqueClash(error)) continue;
      throw error;
    }
  }
}

export async function listRooms(ctx: Context, actor: Actor) {
  // Only rooms this identity currently belongs to; the room code is only shown to members.
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
    const found = await tx.studyRoom.findUnique({ where: { code } });
    if (!found) throw new ApiError(404, "Room code not found");
    // Recheck after taking the lock in case the code was just replaced.
    const room = await lockRoom(tx, found.id);
    if (room.code !== code) throw new ApiError(404, "Room code not found");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const now = ctx.now();
    await addMember(tx, room.id, actor, now);
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
) {
  const member = await tx.roomMember.findFirst({
    where: { roomId, ...identity(actor) },
  });
  if (member) return;
  await tx.roomMember.create({
    data: { roomId, ...identity(actor), joinedAt: now },
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

/** Owner or moderator kicks a member, who can rejoin with the room code. */
export async function removeMember(
  ctx: Context,
  actor: Actor,
  roomId: string,
  memberId: string,
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
    const room = await lockRoom(tx, roomId);
    const by = await moderatorOf(tx, actor, room);
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
