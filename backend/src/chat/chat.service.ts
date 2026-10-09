import {
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
        content,
        createdAt: ctx.now(),
      },
    });
  });
}
