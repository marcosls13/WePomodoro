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

const dayMs = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / dayMs;

// Insights over time for the dashboard. ponytail: days and hours are UTC and
// a session counts on the day/hour the user joined it; add a client time zone
// parameter if per-user local days matter.
export async function getAnalytics(
  db: Database,
  userId: number,
  now: Date,
  days: number,
) {
  const rows = await db.$queryRaw<
    { day: string; seconds: number; completed: number; sessions: number }[]
  >`
    SELECT to_char(p."joinedAt", 'YYYY-MM-DD') AS day,
           SUM(p."focusedSeconds")::int AS seconds,
           COUNT(*) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS completed,
           COUNT(*)::int AS sessions
    FROM "SessionParticipant" p
    JOIN "PomodoroSession" s ON s."id" = p."sessionId"
    WHERE p."userId" = ${userId} AND s."phase" = 'FOCUS' AND p."focusedSeconds" > 0
    GROUP BY 1 ORDER BY 1`;
  const hours = await db.$queryRaw<{ hour: number; seconds: number }[]>`
    SELECT EXTRACT(HOUR FROM p."joinedAt")::int AS hour,
           SUM(p."focusedSeconds")::int AS seconds
    FROM "SessionParticipant" p
    JOIN "PomodoroSession" s ON s."id" = p."sessionId"
    WHERE p."userId" = ${userId} AND s."phase" = 'FOCUS' AND p."focusedSeconds" > 0
    GROUP BY 1`;

  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = Math.floor(now.getTime() / dayMs);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date((today - days + 1 + i) * dayMs)
      .toISOString()
      .slice(0, 10);
    const row = byDay.get(date);
    return {
      date,
      focusedSeconds: row?.seconds ?? 0,
      completedSessions: row?.completed ?? 0,
    };
  });

  // Streaks count consecutive days with focus. One that ended yesterday is
  // still alive: today isn't over.
  let longest = 0;
  let run = 0;
  let previous = NaN;
  for (const { day } of rows) {
    run = dayNumber(day) === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = dayNumber(day);
  }
  let current = 0;
  if (previous >= today - 1) current = run;

  const seconds = rows.reduce((sum, row) => sum + row.seconds, 0);
  const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const best = rows.reduce<(typeof rows)[number] | null>(
    (top, row) => (!top || row.seconds > top.seconds ? row : top),
    null,
  );
  const byHour = Array.from(
    { length: 24 },
    (_, hour) => hours.find((row) => row.hour === hour)?.seconds ?? 0,
  );
  return {
    days,
    daily,
    windowFocusedSeconds: daily.reduce((sum, d) => sum + d.focusedSeconds, 0),
    activeDays: rows.length,
    currentStreak: current,
    longestStreak: longest,
    averageSessionSeconds: sessions ? Math.round(seconds / sessions) : 0,
    bestDay: best && { date: best.day, focusedSeconds: best.seconds },
    focusedSecondsByHour: byHour,
  };
}
