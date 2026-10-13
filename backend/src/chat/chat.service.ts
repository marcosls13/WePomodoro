import {
  ApiError,
  identity,
  transaction,
  type Actor,
  type Context,
} from "../api/common.js";
import { activeMember } from "../timers/timers.service.js";

/** Newest messages, or those after `after` (a message id) oldest first, for polling. */
export async function listMessages(
  ctx: Context,
  actor: Actor,
  roomId: string,
  after: number | undefined,
  limit: number,
) {
  return transaction(ctx, async (tx) => {
    await activeMember(tx, actor, roomId);
    if (after !== undefined)
      return tx.message.findMany({
        where: { roomId, id: { gt: after } },
        orderBy: { id: "asc" },
        take: limit,
      });
    const latest = await tx.message.findMany({
      where: { roomId },
      orderBy: { id: "desc" },
      take: limit,
    });
    return latest.reverse();
  });
}

export async function sendMessage(
  ctx: Context,
  actor: Actor,
  roomId: string,
  content: string,
) {
  return transaction(ctx, async (tx) => {
    const member = await activeMember(tx, actor, roomId);
    if (member.mutedUntil && member.mutedUntil > ctx.now())
      throw new ApiError(403, "You are muted in this room");
    const author = member.userId
      ? (await tx.user.findUniqueOrThrow({ where: { id: member.userId } }))
          .username
      : (
          await tx.guestSession.findUniqueOrThrow({
            where: { id: member.guestSessionId ?? "" },
          })
        ).displayName;
    return tx.message.create({
      data: {
        roomId,
        ...identity(actor),
        authorName: author,
        isGuest: actor.userId === null,
        content,
        createdAt: ctx.now(),
      },
    });
  });
}

/** The author or the room owner can delete a message. */
export async function deleteMessage(
  ctx: Context,
  actor: Actor,
  roomId: string,
  messageId: number,
) {
  return transaction(ctx, async (tx) => {
    await activeMember(tx, actor, roomId);
    const message = await tx.message.findFirst({
      where: { id: messageId, roomId },
      include: { room: { select: { ownerId: true } } },
    });
    if (!message) throw new ApiError(404, "Message not found");
    const mine =
      (actor.userId !== null && message.userId === actor.userId) ||
      (actor.guestSessionId !== null &&
        message.guestSessionId === actor.guestSessionId);
    if (!mine && message.room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the author or the owner can delete it");
    await tx.message.delete({ where: { id: messageId } });
  });
}
