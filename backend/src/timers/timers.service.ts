import type {
  PomodoroSession,
  SessionParticipant,
} from "../generated/prisma/client.js";
import {
  ApiError,
  identity,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";

export const liveStatuses = ["ACTIVE", "PAUSED"] as const;

export function elapsed(session: PomodoroSession, now: Date) {
  if (session.status !== "ACTIVE") return session.elapsedSeconds;
  const since = session.resumedAt ?? session.startedAt;
  return Math.min(
    session.plannedSeconds,
    session.elapsedSeconds +
      Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)),
  );
}

export function timerView(session: PomodoroSession, now: Date) {
  const elapsedSeconds = elapsed(session, now);
  return {
    ...session,
    elapsedSeconds,
    remainingSeconds: Math.max(0, session.plannedSeconds - elapsedSeconds),
    serverTime: now,
  };
}

async function credit(
  tx: Transaction,
  session: PomodoroSession,
  participant: SessionParticipant,
  at: Date,
) {
  const since = Math.max(
    participant.creditedAt.getTime(),
    participant.joinedAt.getTime(),
    (session.resumedAt ?? session.startedAt).getTime(),
  );
  const extra =
    session.status === "ACTIVE" && session.phase === "FOCUS"
      ? Math.max(0, Math.floor((at.getTime() - since) / 1000))
      : 0;
  const focusedSeconds = Math.min(
    session.plannedSeconds,
    participant.focusedSeconds + extra,
  );
  return tx.sessionParticipant.update({
    where: { id: participant.id },
    data: { focusedSeconds, creditedAt: at },
  });
}

export async function lockRoom(tx: Transaction, roomId: string) {
  await tx.$queryRaw`SELECT "id" FROM "StudyRoom" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
  const room = await tx.studyRoom.findUnique({ where: { id: roomId } });
  if (!room) throw new ApiError(404, "Room not found");
  return room;
}

async function lockSession(tx: Transaction, sessionId: string) {
  // Always lock room before session, including scheduler operations.
  const current = await tx.pomodoroSession.findUnique({
    where: { id: sessionId },
  });
  if (!current) throw new ApiError(404, "Timer not found");
  if (current.roomId) await lockRoom(tx, current.roomId);
  await tx.$queryRaw`SELECT "id" FROM "PomodoroSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
  return tx.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } });
}

export async function settle(
  tx: Transaction,
  session: PomodoroSession,
  now: Date,
) {
  if (
    session.status !== "ACTIVE" ||
    elapsed(session, now) < session.plannedSeconds
  )
    return session;
  const since = session.resumedAt ?? session.startedAt;
  const end = new Date(
    since.getTime() + (session.plannedSeconds - session.elapsedSeconds) * 1000,
  );
  const participants = await tx.sessionParticipant.findMany({
    where: { sessionId: session.id, leftAt: null },
  });
  for (const participant of participants) {
    const updated = await credit(tx, session, participant, end);
    await tx.sessionParticipant.update({
      where: { id: participant.id },
      data: {
        leftAt: end,
        completedAt:
          session.phase === "FOCUS" &&
          updated.focusedSeconds >= session.plannedSeconds
            ? end
            : null,
      },
    });
  }
  return tx.pomodoroSession.update({
    where: { id: session.id },
    data: {
      status: "COMPLETED",
      endedAt: end,
      pausedAt: null,
      elapsedSeconds: session.plannedSeconds,
    },
  });
}

export async function activeMember(
  tx: Transaction,
  actor: Actor,
  roomId: string,
) {
  const member = await tx.roomMember.findFirst({
    where: { roomId, ...identity(actor) },
  });
  if (!member) throw new ApiError(403, "You must be an active room member");
  return member;
}

async function available(
  tx: Transaction,
  actor: Actor,
  now: Date,
  except?: string,
) {
  if (actor.userId !== null)
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
  else
    await tx.$queryRaw`SELECT "id" FROM "GuestSession" WHERE "id" = ${actor.guestSessionId}::uuid FOR UPDATE`;
  const others = await tx.pomodoroSession.findMany({
    where: {
      id: except ? { not: except } : undefined,
      status: { in: [...liveStatuses] },
      participants: { some: { ...identity(actor), leftAt: null } },
    },
  });
  for (const other of others) {
    const current = await settle(tx, await lockSession(tx, other.id), now);
    if (liveStatuses.includes(current.status as "ACTIVE" | "PAUSED"))
      throw new ApiError(
        409,
        "A participant already has another live timer; leave or cancel it first",
      );
  }
}

export async function attend(
  tx: Transaction,
  actor: Actor,
  session: PomodoroSession,
  now: Date,
) {
  if (!liveStatuses.includes(session.status as "ACTIVE" | "PAUSED"))
    throw new ApiError(409, "This timer has ended");
  await available(tx, actor, now, session.id);
  const previous = await tx.sessionParticipant.findFirst({
    where: { sessionId: session.id, ...identity(actor) },
  });
  if (previous && !previous.leftAt) return previous;
  if (previous)
    return tx.sessionParticipant.update({
      where: { id: previous.id },
      data: { leftAt: null, creditedAt: now, completedAt: null },
    });
  return tx.sessionParticipant.create({
    data: {
      sessionId: session.id,
      ...identity(actor),
      joinedAt: now,
      creditedAt: now,
    },
  });
}

export async function leaveTimer(
  tx: Transaction,
  actor: Actor,
  session: PomodoroSession,
  now: Date,
) {
  const participant = await tx.sessionParticipant.findFirst({
    where: { sessionId: session.id, ...identity(actor), leftAt: null },
  });
  if (!participant) return;
  await credit(tx, session, participant, now);
  await tx.sessionParticipant.update({
    where: { id: participant.id },
    data: { leftAt: now },
  });
}

async function access(
  tx: Transaction,
  actor: Actor,
  session: PomodoroSession,
  control: boolean,
) {
  if (session.roomId) {
    const room = await lockRoom(tx, session.roomId);
    await activeMember(tx, actor, room.id);
    if (control && room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the room owner can control the timer");
  } else {
    const participant = await tx.sessionParticipant.findFirst({
      where: { sessionId: session.id, ...identity(actor) },
    });
    if (!participant) throw new ApiError(404, "Timer not found");
  }
}

export async function startSolo(
  ctx: Context,
  actor: Actor,
  phase: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK",
  plannedSeconds: number,
) {
  return transaction(ctx, async (tx) => {
    const now = ctx.now();
    await available(tx, actor, now);
    const session = await tx.pomodoroSession.create({
      data: {
        phase,
        plannedSeconds,
        startedAt: now,
        participants: {
          create: { ...identity(actor), joinedAt: now, creditedAt: now },
        },
      },
    });
    return timerView(session, now);
  });
}

export async function startRoom(ctx: Context, actor: Actor, roomId: string) {
  return transaction(ctx, async (tx) => {
    const room = await lockRoom(tx, roomId);
    if (room.ownerId !== actor.userId)
      throw new ApiError(403, "Only the room owner can start a timer");
    if (room.closedAt) throw new ApiError(409, "Room is closed");
    const live = await tx.pomodoroSession.findFirst({
      where: { roomId, status: { in: [...liveStatuses] } },
    });
    if (
      live &&
      liveStatuses.includes(
        (await settle(tx, live, ctx.now())).status as "ACTIVE" | "PAUSED",
      )
    )
      throw new ApiError(409, "The room already has a live timer");
    const previous = await tx.pomodoroSession.findFirst({
      where: { roomId, status: "COMPLETED" },
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    });
    let phase: "FOCUS" | "SHORT_BREAK" | "LONG_BREAK" = "FOCUS";
    if (previous?.phase === "FOCUS") {
      const longBreak = await tx.pomodoroSession.findFirst({
        where: { roomId, phase: "LONG_BREAK", status: "COMPLETED" },
        orderBy: { endedAt: "desc" },
      });
      const count = await tx.pomodoroSession.count({
        where: {
          roomId,
          phase: "FOCUS",
          status: "COMPLETED",
          ...(longBreak?.endedAt ? { endedAt: { gt: longBreak.endedAt } } : {}),
        },
      });
      phase =
        count >= room.cyclesBeforeLongBreak ? "LONG_BREAK" : "SHORT_BREAK";
    }
    const duration =
      phase === "FOCUS"
        ? room.focusSeconds
        : phase === "SHORT_BREAK"
          ? room.shortBreakSeconds
          : room.longBreakSeconds;
    const now = ctx.now();
    const members = await tx.roomMember.findMany({
      where: {
        roomId,
        OR: [
          { userId: { not: null } },
          { guestSession: { expiresAt: { gt: now } } },
        ],
      },
    });
    members.sort(
      (a, b) =>
        (a.userId ?? 2147483647) - (b.userId ?? 2147483647) ||
        (a.guestSessionId ?? "").localeCompare(b.guestSessionId ?? ""),
    );
    for (const member of members) await available(tx, member, now);
    const session = await tx.pomodoroSession.create({
      data: {
        roomId,
        phase,
        plannedSeconds: duration,
        startedAt: now,
        participants: {
          create: members.map((member) => ({
            userId: member.userId,
            guestSessionId: member.guestSessionId,
            joinedAt: now,
            creditedAt: now,
          })),
        },
      },
    });
    return timerView(session, now);
  });
}

export async function getTimer(ctx: Context, actor: Actor, sessionId: string) {
  return transaction(ctx, async (tx) => {
    const current = await lockSession(tx, sessionId);
    await access(tx, actor, current, false);
    return timerView(await settle(tx, current, ctx.now()), ctx.now());
  });
}

export async function timerAction(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  action: "pause" | "resume" | "complete" | "cancel" | "join" | "leave",
) {
  return transaction(ctx, async (tx) => {
    let session = await lockSession(tx, sessionId);
    await access(tx, actor, session, !["join", "leave"].includes(action));
    const now = ctx.now();
    session = await settle(tx, session, now);
    if (action === "join") {
      if (!session.roomId)
        throw new ApiError(409, "Solo timers cannot be joined");
      await attend(tx, actor, session, now);
    } else if (action === "leave") {
      if (!session.roomId)
        throw new ApiError(409, "Cancel a solo timer to leave it");
      await leaveTimer(tx, actor, session, now);
    } else if (action === "complete") {
      if (session.status !== "COMPLETED")
        throw new ApiError(409, "The planned time has not elapsed");
    } else if (action === "pause") {
      if (session.status !== "ACTIVE")
        throw new ApiError(409, "Only an active timer can be paused");
      for (const participant of await tx.sessionParticipant.findMany({
        where: { sessionId, leftAt: null },
      }))
        await credit(tx, session, participant, now);
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: {
          status: "PAUSED",
          pausedAt: now,
          elapsedSeconds: elapsed(session, now),
        },
      });
    } else if (action === "resume") {
      if (session.status !== "PAUSED")
        throw new ApiError(409, "Only a paused timer can be resumed");
      await tx.sessionParticipant.updateMany({
        where: { sessionId, leftAt: null },
        data: { creditedAt: now },
      });
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: { status: "ACTIVE", pausedAt: null, resumedAt: now },
      });
    } else if (session.status !== "CANCELLED") {
      if (session.status === "COMPLETED")
        throw new ApiError(409, "A completed timer cannot be cancelled");
      for (const participant of await tx.sessionParticipant.findMany({
        where: { sessionId, leftAt: null },
      })) {
        await credit(tx, session, participant, now);
        await tx.sessionParticipant.update({
          where: { id: participant.id },
          data: { leftAt: now },
        });
      }
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: {
          status: "CANCELLED",
          endedAt: now,
          pausedAt: null,
          elapsedSeconds: elapsed(session, now),
        },
      });
    }
    return timerView(session, now);
  });
}

// Safe to run on every instance: transactions and row locks prevent double credit.
export async function sweepTimers(ctx: Context) {
  const sessions = await ctx.db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PomodoroSession"
    WHERE "status" = 'ACTIVE'
      AND COALESCE("resumedAt", "startedAt") +
          ("plannedSeconds" - "elapsedSeconds") * INTERVAL '1 second' <= ${ctx.now()}
    ORDER BY COALESCE("resumedAt", "startedAt") ASC LIMIT 500`;

  for (const session of sessions) {
    await transaction(ctx, async (tx) => {
      // A simultaneous account deletion may have removed this timer.
      if (await tx.pomodoroSession.findUnique({ where: { id: session.id } }))
        await settle(tx, await lockSession(tx, session.id), ctx.now());
    });
  }
}

export async function cancelRoomTimer(
  tx: Transaction,
  roomId: string,
  now: Date,
) {
  let session = await tx.pomodoroSession.findFirst({
    where: { roomId, status: { in: [...liveStatuses] } },
  });
  if (!session) return;
  session = await settle(tx, session, now);
  if (session.status === "COMPLETED") return;
  for (const participant of await tx.sessionParticipant.findMany({
    where: { sessionId: session.id, leftAt: null },
  })) {
    await credit(tx, session, participant, now);
    await tx.sessionParticipant.update({
      where: { id: participant.id },
      data: { leftAt: now },
    });
  }
  await tx.pomodoroSession.update({
    where: { id: session.id },
    data: {
      status: "CANCELLED",
      endedAt: now,
      pausedAt: null,
      elapsedSeconds: elapsed(session, now),
    },
  });
}
