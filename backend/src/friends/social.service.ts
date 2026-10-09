import {
  ApiError,
  registered,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";
import { addMember } from "../rooms/rooms.service.js";
import { lockRoom } from "../timers/timers.service.js";

// A heartbeat younger than this counts as online.
export const presenceWindowMs = 60_000;

/** Heartbeat: "I'm online", optionally inside one of my servers. */
export async function setPresence(
  ctx: Context,
  actor: Actor,
  roomId: string | null,
) {
  const userId = registered(actor);
  if (roomId) {
    const member = await ctx.db.roomMember.findFirst({
      where: { roomId, userId, room: { closedAt: null } },
    });
    if (!member) throw new ApiError(403, "You are not a member of that room");
  }
  await ctx.db.presence.upsert({
    where: { userId },
    create: { userId, roomId, seenAt: ctx.now() },
    update: { roomId, seenAt: ctx.now() },
  });
}

export async function areFriends(tx: Transaction, a: number, b: number) {
  return Boolean(
    await tx.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    }),
  );
}

const personAndRoom = {
  room: { select: { id: true, name: true } },
} as const;

export async function listJoinRequests(ctx: Context, actor: Actor) {
  const me = registered(actor);
  const [incoming, outgoing] = await Promise.all([
    ctx.db.joinRequest.findMany({
      where: { targetId: me },
      include: {
        ...personAndRoom,
        requester: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    ctx.db.joinRequest.findMany({
      where: { requesterId: me },
      include: {
        ...personAndRoom,
        target: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { incoming, outgoing };
}

/** Ask a friend, who is in a server you are not in, to let you join it. */
export async function askToJoin(
  ctx: Context,
  actor: Actor,
  friendId: number,
  roomId: string,
) {
  const me = registered(actor);
  return transaction(ctx, async (tx) => {
    if (!(await areFriends(tx, me, friendId)))
      throw new ApiError(403, "You can only ask your friends");
    const room = await lockRoom(tx, roomId);
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    if (
      !(await tx.roomMember.findFirst({ where: { roomId, userId: friendId } }))
    )
      throw new ApiError(404, "Your friend is not in that room");
    if (await tx.roomMember.findFirst({ where: { roomId, userId: me } }))
      throw new ApiError(409, "You are already in that room");
    return tx.joinRequest.upsert({
      where: {
        roomId_requesterId_targetId: {
          roomId,
          requesterId: me,
          targetId: friendId,
        },
      },
      create: {
        roomId,
        requesterId: me,
        targetId: friendId,
        createdAt: ctx.now(),
      },
      update: {},
    });
  });
}

/** The friend who was asked lets the requester in as a regular member. */
export async function acceptJoin(ctx: Context, actor: Actor, id: string) {
  const me = registered(actor);
  await transaction(ctx, async (tx) => {
    const request = await tx.joinRequest.findFirst({
      where: { id, targetId: me },
    });
    if (!request) throw new ApiError(404, "Join request not found");
    const room = await lockRoom(tx, request.roomId);
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    if (
      !(await tx.roomMember.findFirst({
        where: { roomId: room.id, userId: me },
      })) ||
      !(await areFriends(tx, me, request.requesterId))
    )
      throw new ApiError(409, "This request can no longer be accepted");
    await addMember(
      tx,
      room.id,
      { userId: request.requesterId, guestSessionId: null },
      ctx.now(),
    );
    await tx.joinRequest.delete({ where: { id } });
  });
}

/** Decline (target) or cancel (requester). */
export async function dropJoinRequest(ctx: Context, actor: Actor, id: string) {
  const me = registered(actor);
  const result = await ctx.db.joinRequest.deleteMany({
    where: { id, OR: [{ requesterId: me }, { targetId: me }] },
  });
  if (!result.count) throw new ApiError(404, "Join request not found");
}
