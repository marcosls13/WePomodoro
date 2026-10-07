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
      leftAt: null,
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
      displayName: user?.username ?? guestSession?.displayName,
    })),
    timer: current ? timerView(current, now) : null,
  };
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
            inviteCode: randomBytes(9).toString("base64url"),
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
      members: { some: { ...identity(actor), leftAt: null } },
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
    const found = await tx.studyRoom.findUnique({
      where: { inviteCode: code },
    });
    if (!found) throw new ApiError(404, "Invite code not found");
    const room = await lockRoom(tx, found.id);
    // Recheck after taking the lock in case the invite was rotated.
    if (room.inviteCode !== code)
      throw new ApiError(404, "Invite code not found");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const now = ctx.now();
    const member = await tx.roomMember.findFirst({
      where: { roomId: room.id, ...identity(actor) },
    });
    if (member)
      await tx.roomMember.update({
        where: { id: member.id },
        data: { leftAt: null },
      });
    else
      await tx.roomMember.create({
        data: { roomId: room.id, ...identity(actor), joinedAt: now },
      });
    const session = await tx.pomodoroSession.findFirst({
      where: { roomId: room.id, status: { in: [...liveStatuses] } },
    });
    if (session) {
      const current = await settle(tx, session, now);
      if (liveStatuses.includes(current.status as "ACTIVE" | "PAUSED"))
        await attend(tx, actor, current, now);
    }
    return roomView(tx, room.id, now);
  });
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
    await tx.roomMember.update({
      where: { id: member.id },
      data: { leftAt: now },
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
  action: "close" | "rotate" | "transfer",
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
    if (action === "rotate")
      return tx.studyRoom.update({
        where: { id: roomId },
        data: { inviteCode: randomBytes(9).toString("base64url") },
      });
    const member = await tx.roomMember.findFirst({
      where: { roomId, userId: newOwnerId, leftAt: null },
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

export async function removeMember(
  ctx: Context,
  actor: Actor,
  roomId: string,
  memberId: string,
) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the owner can remove members");
    const member = await tx.roomMember.findFirst({
      where: { id: memberId, roomId, leftAt: null },
    });
    if (!member) throw new ApiError(404, "Member not found");
    if (member.userId === room.ownerId)
      throw new ApiError(409, "The owner cannot be removed");
    const now = ctx.now();
    const session = await tx.pomodoroSession.findFirst({
      where: { roomId, status: { in: [...liveStatuses] } },
    });
    if (session)
      await leaveTimer(tx, member, await settle(tx, session, now), now);
    await tx.roomMember.update({
      where: { id: memberId },
      data: { leftAt: now },
    });
  });
}
