import type {
  PomodoroSession,
  SessionMember,
} from "../generated/prisma/client.js";
import {
  ApiError,
  identity,
  transaction,
  type Actor,
  type Context,
  type Transaction,
} from "../api/common.js";

type Phase = PomodoroSession["phase"];

/** Length of the current phase, from the session's settings. */
export function plannedSeconds(session: PomodoroSession) {
  return phaseSeconds(session, session.phase);
}

export function elapsed(session: PomodoroSession, now: Date) {
  if (session.timerStatus !== "RUNNING" || !session.resumedAt)
    return session.elapsedSeconds;
  return Math.min(
    plannedSeconds(session),
    session.elapsedSeconds +
      Math.max(
        0,
        Math.floor((now.getTime() - session.resumedAt.getTime()) / 1000),
      ),
  );
}

export function timerView(session: PomodoroSession, now: Date) {
  const elapsedSeconds = elapsed(session, now);
  return {
    ...session,
    elapsedSeconds,
    plannedSeconds: plannedSeconds(session),
    remainingSeconds: Math.max(0, plannedSeconds(session) - elapsedSeconds),
    serverTime: now,
  };
}

/** Length of a phase according to the session's settings. */
export function phaseSeconds(
  settings: Pick<PomodoroSession, "focusSeconds" | "breakSeconds">,
  phase: Phase,
) {
  return phase === "FOCUS" ? settings.focusSeconds : settings.breakSeconds;
}

/**
 * Adds the focus time earned since the member's last credit. Registered users
 * also add it to their lifetime UserStat; guests keep nothing.
 */
async function credit(
  tx: Transaction,
  session: PomodoroSession,
  member: SessionMember,
  at: Date,
) {
  const since = Math.max(
    member.creditedAt.getTime(),
    member.joinedAt.getTime(),
    session.resumedAt?.getTime() ?? 0,
  );
  const running =
    session.timerStatus === "RUNNING" && session.phase === "FOCUS";
  const gained = running
    ? Math.max(0, Math.floor((at.getTime() - since) / 1000))
    : 0;
  if (gained > 0 && member.userId !== null)
    await tx.userStat.upsert({
      where: { userId: member.userId },
      create: { userId: member.userId, focusedSeconds: gained },
      update: { focusedSeconds: { increment: gained } },
    });
  return tx.sessionMember.update({
    where: { id: member.id },
    data: { creditedAt: at },
  });
}

async function creditAll(tx: Transaction, session: PomodoroSession, at: Date) {
  const members = await tx.sessionMember.findMany({
    where: { sessionId: session.id },
  });
  return Promise.all(members.map((member) => credit(tx, session, member, at)));
}

export async function lockSession(tx: Transaction, sessionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "PomodoroSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
  const session = await tx.pomodoroSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new ApiError(404, "Session not found");
  return session;
}

/** If the running phase has run out, finish it: credit everyone and go IDLE. */
export async function settle(
  tx: Transaction,
  session: PomodoroSession,
  now: Date,
) {
  if (
    session.timerStatus !== "RUNNING" ||
    !session.resumedAt ||
    elapsed(session, now) < plannedSeconds(session)
  )
    return session;
  const end = new Date(
    session.resumedAt.getTime() +
      (plannedSeconds(session) - session.elapsedSeconds) * 1000,
  );
  await creditAll(tx, session, end);
  // Focus and break alternate.
  const next: Phase = session.phase === "FOCUS" ? "BREAK" : "FOCUS";
  return tx.pomodoroSession.update({
    where: { id: session.id },
    data: {
      timerStatus: "IDLE",
      resumedAt: null,
      elapsedSeconds: 0,
      phase: next,
    },
  });
}

/** A member of this session, or 403. */
export async function activeMember(
  tx: Transaction,
  actor: Actor,
  sessionId: string,
) {
  const member = await tx.sessionMember.findFirst({
    where: { sessionId, ...identity(actor) },
  });
  if (!member) throw new ApiError(403, "You must be a member of this session");
  return member;
}

/** The owner of this session, or 403. */
export async function ownerMember(
  tx: Transaction,
  actor: Actor,
  sessionId: string,
) {
  const member = await activeMember(tx, actor, sessionId);
  if (!member.isOwner) throw new ApiError(403, "Only the owner can do this");
  return member;
}

/** One live timer per person: fail if this person is in another running or paused one. */
export async function available(
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
      timerStatus: { not: "IDLE" },
      members: { some: identity(actor) },
    },
  });
  for (const other of others) {
    const current = await settle(tx, await lockSession(tx, other.id), now);
    if (current.timerStatus !== "IDLE")
      throw new ApiError(
        409,
        "A member is already in another live timer; leave or cancel it first",
      );
  }
}

/**
 * Makes sure the session still has an owner: the longest-standing member takes
 * over (registered users first), and a session with no members is deleted.
 * Call it after anything that removes members.
 */
export async function keepOwner(tx: Transaction, sessionId: string) {
  const members = await tx.sessionMember.findMany({
    where: { sessionId },
    orderBy: { joinedAt: "asc" },
  });
  if (!members.length) {
    await tx.pomodoroSession.deleteMany({ where: { id: sessionId } });
    return;
  }
  if (members.some((member) => member.isOwner)) return;
  const next = members.find((member) => member.userId !== null) ?? members[0];
  await tx.sessionMember.update({
    where: { id: next.id },
    data: { isOwner: true },
  });
}

/** Leave or kick: credit what the member earned, delete the row, keep an owner. */
export async function dropMember(
  tx: Transaction,
  session: PomodoroSession,
  member: SessionMember,
  now: Date,
) {
  const current = await settle(tx, session, now);
  await credit(tx, current, member, now);
  await tx.sessionMember.delete({ where: { id: member.id } });
  await keepOwner(tx, session.id);
}

/** Stop the timer without finishing the phase: credit, then back to IDLE. */
export async function cancelTimer(
  tx: Transaction,
  session: PomodoroSession,
  now: Date,
) {
  const current = await settle(tx, session, now);
  if (current.timerStatus === "IDLE") return current;
  await creditAll(tx, current, now);
  return tx.pomodoroSession.update({
    where: { id: session.id },
    data: { timerStatus: "IDLE", resumedAt: null, elapsedSeconds: 0 },
  });
}

export async function timerAction(
  ctx: Context,
  actor: Actor,
  sessionId: string,
  action: "start" | "pause" | "resume" | "cancel",
) {
  return transaction(ctx, async (tx) => {
    let session = await lockSession(tx, sessionId);
    await ownerMember(tx, actor, sessionId);
    const now = ctx.now();
    session = await settle(tx, session, now);
    if (action === "start") {
      if (session.timerStatus !== "IDLE")
        throw new ApiError(409, "The timer is already live");
      const members = await tx.sessionMember.findMany({
        where: { sessionId },
        orderBy: { id: "asc" },
      });
      for (const member of members) await available(tx, member, now, sessionId);
      await tx.sessionMember.updateMany({
        where: { sessionId },
        data: { creditedAt: now },
      });
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: { timerStatus: "RUNNING", resumedAt: now, elapsedSeconds: 0 },
      });
    } else if (action === "pause") {
      if (session.timerStatus !== "RUNNING")
        throw new ApiError(409, "Only a running timer can be paused");
      await creditAll(tx, session, now);
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: {
          timerStatus: "PAUSED",
          resumedAt: null,
          elapsedSeconds: elapsed(session, now),
        },
      });
    } else if (action === "resume") {
      if (session.timerStatus !== "PAUSED")
        throw new ApiError(409, "Only a paused timer can be resumed");
      await tx.sessionMember.updateMany({
        where: { sessionId },
        data: { creditedAt: now },
      });
      session = await tx.pomodoroSession.update({
        where: { id: sessionId },
        data: { timerStatus: "RUNNING", resumedAt: now },
      });
    } else session = await cancelTimer(tx, session, now);
    return timerView(session, now);
  });
}

// Safe to run on every instance: transactions and row locks prevent double credit.
export async function sweepTimers(ctx: Context) {
  const sessions = await ctx.db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PomodoroSession"
    WHERE "timerStatus" = 'RUNNING'
      AND "resumedAt" + (CASE "phase" WHEN 'FOCUS' THEN "focusSeconds" ELSE "breakSeconds" END - "elapsedSeconds") * INTERVAL '1 second' <= ${ctx.now()}
    ORDER BY "resumedAt" ASC LIMIT 500`;

  for (const session of sessions) {
    await transaction(ctx, async (tx) => {
      // A simultaneous deletion may have removed this session.
      if (await tx.pomodoroSession.findUnique({ where: { id: session.id } }))
        await settle(tx, await lockSession(tx, session.id), ctx.now());
    });
  }
}
