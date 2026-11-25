import { ApiError, transaction, type Context } from "../api/common.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type Database = PrismaClient | Prisma.TransactionClient;

// Internal service: the authenticated user ID must come from trusted middleware.
export async function getUserStatistics(db: Database, userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return null;
  const stat = await db.userStat.findUnique({ where: { userId } });
  return {
    focusedSeconds: stat?.focusedSeconds ?? 0,
    wins: stat?.wins ?? 0,
    losses: stat?.losses ?? 0,
  };
}

export async function addFocusedSeconds(
  ctx: Context,
  userId: number,
  seconds: number,
) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86400)
    throw new ApiError(400, "seconds must be an integer between 0 and 86400");
  if (seconds === 0) return;
  await transaction(ctx, async (tx) => {
    if (!(await tx.user.findUnique({ where: { id: userId } }))) return;
    await tx.userStat.upsert({
      where: { userId },
      create: { userId, focusedSeconds: seconds },
      update: { focusedSeconds: { increment: seconds } },
    });
  });
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
