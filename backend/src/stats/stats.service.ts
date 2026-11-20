import { transaction, type Context } from "../api/common.js";
import { plannedSeconds } from "../timers/timers.service.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type Database = PrismaClient | Prisma.TransactionClient;

// Internal service: the authenticated user ID must come from trusted middleware.
export async function getUserStatistics(
  db: Database,
  userId: number,
  now?: Date,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return null;

  const [stat, running] = await Promise.all([
    db.userStat.findUnique({ where: { userId } }),
    now
      ? db.sessionMember.findMany({
          where: {
            userId,
            session: { phase: "FOCUS", timerStatus: "RUNNING" },
          },
          include: { session: true },
        })
      : [],
  ]);

  // Focus earned since the last credit in timers that are running right now.
  let liveSeconds = 0;
  for (const member of running) {
    const session = member.session;
    if (!now || !session.resumedAt) continue;
    const deadline =
      session.resumedAt.getTime() +
      (plannedSeconds(session) - session.elapsedSeconds) * 1000;
    const end = Math.min(now.getTime(), deadline);
    const since = Math.max(
      session.resumedAt.getTime(),
      member.creditedAt.getTime(),
      member.joinedAt.getTime(),
    );
    liveSeconds += Math.max(0, Math.floor((end - since) / 1000));
  }
  const wins = stat?.wins ?? 0;
  const losses = stat?.losses ?? 0;
  return {
    focusedSeconds: (stat?.focusedSeconds ?? 0) + liveSeconds,
    wins,
    losses,
    played: wins + losses,
  };
}

/**
 * Records one finished minigame (any game). Called by the game server over
 * WebSocket, which decides the winner. Guests (`null`) keep no stats.
 */
export async function recordMatch(
  ctx: Context,
  winnerId: number | null,
  loserId: number | null,
) {
  await transaction(ctx, async (tx) => {
    for (const [userId, column] of [
      [winnerId, "wins"],
      [loserId, "losses"],
    ] as const)
      if (userId !== null)
        await tx.userStat.upsert({
          where: { userId },
          create: { userId, [column]: 1 },
          update: { [column]: { increment: 1 } },
        });
  });
}
