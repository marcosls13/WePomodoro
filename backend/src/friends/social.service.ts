import {
  ApiError,
  registered,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";

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
