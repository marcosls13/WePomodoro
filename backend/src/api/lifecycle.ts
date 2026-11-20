import {
  identity,
  registered,
  transaction,
  ApiError,
  type Actor,
  type Context,
} from "./common.js";
import { keepOwner } from "../timers/timers.service.js";

export async function endIdentity(
  ctx: Context,
  actor: Actor,
  deleteAccount = false,
) {
  if (deleteAccount) {
    const userId = registered(actor);
    // Their memberships go with the account. Sessions they owned pass to the
    // next member, and a session left empty is deleted.
    await transaction(ctx, async (tx) => {
      const memberships = await tx.sessionMember.findMany({
        where: { userId },
        select: { sessionId: true },
        orderBy: { sessionId: "asc" },
      });
      await tx.user.delete({ where: { id: userId } });
      for (const { sessionId } of memberships) await keepOwner(tx, sessionId);
    });
    return;
  }
  if (actor.userId !== null) {
    if (!actor.authSessionId) throw new ApiError(401, "Invalid session");
    await ctx.db.authSession.deleteMany({
      where: { id: actor.authSessionId, userId: actor.userId },
    });
    return;
  }
  // Guest logout deletes its temporary identity and its memberships. Nothing
  // of a guest is kept, so there is no progress to credit.
  await transaction(ctx, async (tx) => {
    const memberships = await tx.sessionMember.findMany({
      where: identity(actor),
      select: { sessionId: true },
      orderBy: { sessionId: "asc" },
    });
    await tx.guestSession.deleteMany({
      where: { id: actor.guestSessionId ?? "" },
    });
    for (const { sessionId } of memberships) await keepOwner(tx, sessionId);
  });
}

export async function cleanupExpiredSessions(ctx: Context) {
  await ctx.db.authSession.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  // A session with no owner has lost its last member or its guest owner expired:
  // pass it on, or delete it when empty.
  const orphans = await ctx.db.pomodoroSession.findMany({
    where: { members: { none: { isOwner: true } } },
    select: { id: true },
    take: 100,
  });
  for (const { id } of orphans)
    await transaction(ctx, (tx) => keepOwner(tx, id));
  await ctx.db.emailToken.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  await ctx.db.pendingSignup.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  await ctx.db.loginChallenge.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  await ctx.db.oAuthCode.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  const guests = await ctx.db.guestSession.findMany({
    where: { expiresAt: { lte: ctx.now() } },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });
  for (const guest of guests)
    await endIdentity(ctx, { userId: null, guestSessionId: guest.id });
}
