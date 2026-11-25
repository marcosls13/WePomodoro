import { registered, ApiError, type Actor, type Context } from "./common.js";

export async function endIdentity(
  ctx: Context,
  actor: Actor,
  deleteAccount = false,
) {
  if (deleteAccount) {
    await ctx.db.user.delete({ where: { id: registered(actor) } });
    return;
  }
  if (actor.userId !== null) {
    if (!actor.authSessionId) throw new ApiError(401, "Invalid session");
    await ctx.db.authSession.deleteMany({
      where: { id: actor.authSessionId, userId: actor.userId },
    });
    return;
  }
  await ctx.db.guestSession.deleteMany({
    where: { id: actor.guestSessionId ?? "" },
  });
}

export async function cleanupExpiredSessions(ctx: Context) {
  await ctx.db.authSession.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
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
  await ctx.db.guestSession.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
}
