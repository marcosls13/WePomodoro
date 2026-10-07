import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type Database = PrismaClient | Prisma.TransactionClient;

// Internal service: the authenticated user ID must come from trusted middleware.
// Keep raw history as the source of truth; add date ranges/pagination when needed.
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

  const [focus, completed, games] = await Promise.all([
    db.sessionParticipant.aggregate({
      where: { userId, session: { phase: "FOCUS" } },
      _sum: { focusedSeconds: true },
    }),
    db.sessionParticipant.count({
      where: {
        userId,
        completedAt: { not: null },
        session: { phase: "FOCUS", status: "COMPLETED" },
      },
    }),
    db.gameResult.groupBy({
      by: ["gameId"],
      where: { userId },
      _count: { _all: true },
      _max: { score: true },
      _sum: { durationSeconds: true },
      orderBy: { gameId: "asc" },
    }),
  ]);

  let liveSeconds = 0;
  if (now) {
    const active = await db.sessionParticipant.findMany({
      where: {
        userId,
        leftAt: null,
        session: { phase: "FOCUS", status: "ACTIVE" },
      },
      include: { session: true },
    });
    for (const participant of active) {
      const session = participant.session;
      const runningSince = session.resumedAt ?? session.startedAt;
      const deadline =
        runningSince.getTime() +
        (session.plannedSeconds - session.elapsedSeconds) * 1000;
      const end = Math.min(now.getTime(), deadline);
      const since = Math.max(
        runningSince.getTime(),
        participant.creditedAt.getTime(),
        participant.joinedAt.getTime(),
      );
      liveSeconds += Math.min(
        session.plannedSeconds - participant.focusedSeconds,
        Math.max(0, Math.floor((end - since) / 1000)),
      );
    }
  }
  return {
    focusedSeconds: (focus._sum.focusedSeconds ?? 0) + liveSeconds,
    completedFocusSessions: completed,
    games: games.map((game) => ({
      gameId: game.gameId,
      gamesPlayed: game._count._all,
      bestScore: game._max.score,
      playedSeconds: game._sum.durationSeconds ?? 0,
    })),
  };
}
