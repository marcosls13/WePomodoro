import {
  identity,
  registered,
  transaction,
  ApiError,
  type Actor,
  type Context,
} from "./common.js";
import {
  cancelRoomTimer,
  leaveTimer,
  liveStatuses,
  lockRoom,
  settle,
  timerAction,
} from "../timers/timers.service.js";

export async function endIdentity(
  ctx: Context,
  actor: Actor,
  deleteAccount = false,
) {
  if (deleteAccount) {
    const userId = registered(actor);
    // Delete rooms only on explicit account deletion. Closing a room alone keeps it.
    await transaction(ctx, async (tx) => {
      const rooms = await tx.studyRoom.findMany({
        where: { ownerId: userId },
        orderBy: { id: "asc" },
      });
      for (const room of rooms) {
        await lockRoom(tx, room.id);
        await cancelRoomTimer(tx, room.id, ctx.now());
        await tx.studyRoom.delete({ where: { id: room.id } });
      }
      // A concurrent ownership transfer may cause FK rejection; never delete others' rooms.
      await tx.user.delete({ where: { id: userId } });
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
  // Guest logout deletes its temporary identity. Registered study history survives.
  const solos = await ctx.db.pomodoroSession.findMany({
    where: {
      roomId: null,
      status: { in: [...liveStatuses] },
      participants: { some: identity(actor) },
    },
  });
  for (const solo of solos) await timerAction(ctx, actor, solo.id, "cancel");
  await transaction(ctx, async (tx) => {
    const memberships = await tx.roomMember.findMany({
      where: { ...identity(actor), leftAt: null },
      orderBy: { roomId: "asc" },
    });
    for (const member of memberships) {
      await lockRoom(tx, member.roomId);
      const session = await tx.pomodoroSession.findFirst({
        where: { roomId: member.roomId, status: { in: [...liveStatuses] } },
      });
      if (session)
        await leaveTimer(
          tx,
          actor,
          await settle(tx, session, ctx.now()),
          ctx.now(),
        );
    }
    await tx.guestSession.deleteMany({
      where: { id: actor.guestSessionId ?? "" },
    });
  });
}

export async function cleanupExpiredSessions(ctx: Context) {
  await ctx.db.authSession.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  await ctx.db.emailToken.deleteMany({
    where: { expiresAt: { lte: ctx.now() } },
  });
  await ctx.db.loginChallenge.deleteMany({
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
