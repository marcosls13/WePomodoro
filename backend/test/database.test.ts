import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { getUserStatistics } from "../src/stats/stats.service.js";

// Never fall back to DATABASE_URL: these tests must not touch the app database.
const url = new URL(
  process.env.TEST_DATABASE_URL ??
    "postgresql://wepomodoro_test:local_test_only@127.0.0.1:55432/wepomodoro_test",
);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/wepomodoro_test" ||
  url.search ||
  url.hash
) {
  throw new Error("Tests require a local, dedicated wepomodoro_test database.");
}
const connectionString = url.toString();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

before(async () => {
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    assert.equal(result.rows[0]?.name, "wepomodoro_test");
  } finally {
    await pool.end();
  }
  execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "prisma7.config.ts",
    ],
    { env: { ...process.env, DATABASE_URL: connectionString }, stdio: "pipe" },
  );
});
after(async () => {
  await db.$disconnect();
});

// Every test rolls back its own fixtures, including on assertions or SQL errors.
async function isolated(
  action: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  try {
    await db.$transaction(
      async (tx) => {
        await action(tx);
        throw rollback;
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function fixtures(tx: Prisma.TransactionClient) {
  const key = randomUUID();
  const user = await tx.user.create({
    data: {
      email: `${key}@example.test`,
      username: key,
      passwordHash: "test-hash-only",
    },
  });
  const friend = await tx.user.create({
    data: {
      email: `friend-${key}@example.test`,
      username: `friend-${key}`,
    },
  });
  const guest = await tx.guestSession.create({
    data: {
      displayName: "Guest learner",
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const room = await tx.studyRoom.create({
    data: {
      name: "Study together",
      inviteCode: key,
      ownerId: user.id,
      members: { create: { userId: user.id } },
    },
  });
  return { user, friend, guest, room };
}
const knownError = (code: string) => (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;

// Check actual PostgreSQL error metadata instead of accepting any rejection.
function constraintError(name: string) {
  return (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const details = JSON.stringify(error, Object.getOwnPropertyNames(error));
    return error.message.includes(name) || details.includes(name);
  };
}

void test("registered users and guests join a room found by its invite code", async () => {
  await isolated(async (tx) => {
    const { friend, guest, room } = await fixtures(tx);
    const found = await tx.studyRoom.findUniqueOrThrow({
      where: { inviteCode: room.inviteCode },
    });
    await tx.roomMember.createMany({
      data: [
        { roomId: found.id, userId: friend.id },
        { roomId: found.id, guestSessionId: guest.id },
      ],
    });
    assert.equal(await tx.roomMember.count({ where: { roomId: room.id } }), 3);
    assert.equal(found.focusSeconds, 1500);
    assert.equal(found.shortBreakSeconds, 300);
    assert.equal(found.longBreakSeconds, 900);
    assert.equal(found.cyclesBeforeLongBreak, 4);
  });
});

void test("a registered participant can leave and rejoin without duplicate membership", async () => {
  await isolated(async (tx) => {
    const { user, room } = await fixtures(tx);
    await tx.roomMember.update({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      data: { leftAt: new Date() },
    });
    await tx.roomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      create: { roomId: room.id, userId: user.id },
      update: { leftAt: null },
    });
    assert.equal(await tx.roomMember.count({ where: { roomId: room.id } }), 1);
  });
});

void test("registered users and guests can each study alone", async () => {
  await isolated(async (tx) => {
    const { user, guest } = await fixtures(tx);
    const solo = await tx.pomodoroSession.create({
      data: { participants: { create: { userId: user.id } } },
      include: { participants: true },
    });
    const guestSolo = await tx.pomodoroSession.create({
      data: { participants: { create: { guestSessionId: guest.id } } },
      include: { participants: true },
    });
    assert.equal(solo.roomId, null);
    assert.equal(guestSolo.roomId, null);
    assert.equal(solo.participants[0]?.userId, user.id);
    assert.equal(guestSolo.participants[0]?.guestSessionId, guest.id);
  });
});

void test("a shared timer supports pausing, resuming, and completing with individual focus time", async () => {
  await isolated(async (tx) => {
    const { user, guest, room } = await fixtures(tx);
    const start = new Date(Date.now() - 1500000);
    const end = new Date();
    const session = await tx.pomodoroSession.create({
      data: {
        roomId: room.id,
        startedAt: start,
        participants: {
          create: [
            { userId: user.id, joinedAt: start },
            { guestSessionId: guest.id, joinedAt: start },
          ],
        },
      },
    });
    await tx.pomodoroSession.update({
      where: { id: session.id },
      data: { status: "PAUSED", pausedAt: end, elapsedSeconds: 600 },
    });
    await tx.pomodoroSession.update({
      where: { id: session.id },
      data: { status: "ACTIVE", pausedAt: null },
    });
    await tx.pomodoroSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", endedAt: end, elapsedSeconds: 1500 },
    });
    await tx.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
      data: { focusedSeconds: 1500, completedAt: end, leftAt: end },
    });
    await tx.sessionParticipant.update({
      where: {
        sessionId_guestSessionId: {
          sessionId: session.id,
          guestSessionId: guest.id,
        },
      },
      data: { focusedSeconds: 600, leftAt: end },
    });
    const stats = await getUserStatistics(tx, user.id);
    assert.equal(stats?.focusedSeconds, 1500);
    assert.equal(stats.completedFocusSessions, 1);
    // Historical session settings don't change when the room settings change.
    await tx.studyRoom.update({
      where: { id: room.id },
      data: { focusSeconds: 1800 },
    });
    assert.equal(
      (
        await tx.pomodoroSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).plannedSeconds,
      1500,
    );
    // A completed room timer frees the room for its next phase.
    await tx.pomodoroSession.create({
      data: { roomId: room.id, phase: "SHORT_BREAK", plannedSeconds: 300 },
    });
  });
});

void test("statistics isolate users, exclude breaks, retain partial focus, and aggregate games", async () => {
  await isolated(async (tx) => {
    const { user, friend } = await fixtures(tx);
    const start = new Date(Date.now() - 1800000);
    const end = new Date();
    for (const item of [
      { phase: "FOCUS" as const, seconds: 1500, completed: true },
      { phase: "FOCUS" as const, seconds: 300, completed: false },
      { phase: "SHORT_BREAK" as const, seconds: 300, completed: true },
    ]) {
      await tx.pomodoroSession.create({
        data: {
          phase: item.phase,
          status: item.completed ? "COMPLETED" : "CANCELLED",
          startedAt: start,
          endedAt: end,
          participants: {
            create: {
              userId: user.id,
              joinedAt: start,
              focusedSeconds: item.seconds,
              completedAt: item.completed ? end : null,
            },
          },
        },
      });
    }
    await tx.pomodoroSession.create({
      data: {
        participants: { create: { userId: friend.id, focusedSeconds: 999 } },
      },
    });
    const game = await tx.miniGame.create({
      data: { key: randomUUID(), name: "Memory" },
    });
    await tx.gameResult.createMany({
      data: [
        { userId: user.id, gameId: game.id, score: 10, durationSeconds: 30 },
        { userId: user.id, gameId: game.id, score: 25, durationSeconds: 40 },
        { userId: friend.id, gameId: game.id, score: 100, durationSeconds: 90 },
      ],
    });
    assert.deepEqual(await getUserStatistics(tx, user.id), {
      focusedSeconds: 1800,
      completedFocusSessions: 1,
      games: [
        { gameId: game.id, gamesPlayed: 2, bestScore: 25, playedSeconds: 70 },
      ],
    });
    assert.equal(await getUserStatistics(tx, -1), null);
  });
});

void test("new profiles have zero statistics and legacy profiles may have no password hash", async () => {
  await isolated(async (tx) => {
    const { friend } = await fixtures(tx);
    assert.equal(friend.passwordHash, null);
    assert.deepEqual(await getUserStatistics(tx, friend.id), {
      focusedSeconds: 0,
      completedFocusSessions: 0,
      games: [],
    });
  });
});

void test("deleting a guest removes temporary participation without affecting registered history", async () => {
  await isolated(async (tx) => {
    const { user, guest, room } = await fixtures(tx);
    await tx.roomMember.create({
      data: { roomId: room.id, guestSessionId: guest.id },
    });
    const session = await tx.pomodoroSession.create({
      data: {
        roomId: room.id,
        participants: {
          create: [
            { userId: user.id, focusedSeconds: 50 },
            { guestSessionId: guest.id },
          ],
        },
      },
    });
    await tx.guestSession.delete({ where: { id: guest.id } });
    assert.equal(
      await tx.roomMember.count({ where: { guestSessionId: guest.id } }),
      0,
    );
    assert.equal(
      await tx.sessionParticipant.count({ where: { sessionId: session.id } }),
      1,
    );
    assert.equal((await getUserStatistics(tx, user.id))?.focusedSeconds, 50);
  });
});

void test("deleting a room keeps its study history", async () => {
  await isolated(async (tx) => {
    const { user, room } = await fixtures(tx);
    const session = await tx.pomodoroSession.create({
      data: {
        roomId: room.id,
        participants: { create: { userId: user.id, focusedSeconds: 50 } },
      },
    });
    await tx.studyRoom.delete({ where: { id: room.id } });
    assert.equal(
      (
        await tx.pomodoroSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).roomId,
      null,
    );
    assert.equal((await getUserStatistics(tx, user.id))?.focusedSeconds, 50);
  });
});

void test("deleting a user cascades authentication and personal results", async () => {
  await isolated(async (tx) => {
    const { friend } = await fixtures(tx);
    await tx.authSession.create({
      data: {
        userId: friend.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const game = await tx.miniGame.create({
      data: { key: randomUUID(), name: "Memory" },
    });
    await tx.gameResult.create({
      data: {
        userId: friend.id,
        gameId: game.id,
        score: 1,
        durationSeconds: 1,
      },
    });
    await tx.user.delete({ where: { id: friend.id } });
    assert.equal(
      await tx.authSession.count({ where: { userId: friend.id } }),
      0,
    );
    assert.equal(
      await tx.gameResult.count({ where: { userId: friend.id } }),
      0,
    );
  });
});

const invalidCases: {
  name: string;
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
  error: (error: unknown) => boolean;
}[] = [
  {
    name: "duplicate invite codes",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room, user } = await fixtures(tx);
      return tx.studyRoom.create({
        data: {
          name: "Duplicate",
          inviteCode: room.inviteCode,
          ownerId: user.id,
        },
      });
    },
  },
  {
    name: "duplicate registered memberships",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room, user } = await fixtures(tx);
      return tx.roomMember.create({
        data: { roomId: room.id, userId: user.id },
      });
    },
  },
  {
    name: "duplicate guest memberships",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room, guest } = await fixtures(tx);
      await tx.roomMember.create({
        data: { roomId: room.id, guestSessionId: guest.id },
      });
      return tx.roomMember.create({
        data: { roomId: room.id, guestSessionId: guest.id },
      });
    },
  },
  {
    name: "a room without a registered owner",
    error: knownError("P2003"),
    run: (tx) =>
      tx.studyRoom.create({
        data: { name: "Invalid", inviteCode: randomUUID(), ownerId: -1 },
      }),
  },
  {
    name: "membership without an identity",
    error: constraintError("RoomMember_identity_check"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      return tx.roomMember.create({ data: { roomId: room.id } });
    },
  },
  {
    name: "membership with both identities",
    error: constraintError("RoomMember_identity_check"),
    run: async (tx) => {
      const { room, user, guest } = await fixtures(tx);
      return tx.roomMember.create({
        data: { roomId: room.id, userId: user.id, guestSessionId: guest.id },
      });
    },
  },
  {
    name: "participation without an identity",
    error: constraintError("SessionParticipant_identity_check"),
    run: async (tx) => {
      const session = await tx.pomodoroSession.create({ data: {} });
      return tx.sessionParticipant.create({ data: { sessionId: session.id } });
    },
  },
  {
    name: "participation with both identities",
    error: constraintError("SessionParticipant_identity_check"),
    run: async (tx) => {
      const { user, guest } = await fixtures(tx);
      const session = await tx.pomodoroSession.create({ data: {} });
      return tx.sessionParticipant.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          guestSessionId: guest.id,
        },
      });
    },
  },
  {
    name: "duplicate session participation",
    error: knownError("P2002"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      const session = await tx.pomodoroSession.create({
        data: { participants: { create: { userId: user.id } } },
      });
      return tx.sessionParticipant.create({
        data: { sessionId: session.id, userId: user.id },
      });
    },
  },
  {
    name: "a second live timer in a room",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      await tx.pomodoroSession.create({
        data: {
          roomId: room.id,
          status: "PAUSED",
          startedAt: new Date(Date.now() - 1000),
          pausedAt: new Date(),
        },
      });
      return tx.pomodoroSession.create({ data: { roomId: room.id } });
    },
  },
  {
    name: "invalid room durations",
    error: constraintError("StudyRoom_settings_check"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      return tx.studyRoom.update({
        where: { id: room.id },
        data: { focusSeconds: 0 },
      });
    },
  },
  {
    name: "negative focused time",
    error: constraintError("SessionParticipant_progress_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.pomodoroSession.create({
        data: {
          participants: { create: { userId: user.id, focusedSeconds: -1 } },
        },
      });
    },
  },
  {
    name: "completion without an end time",
    error: constraintError("PomodoroSession_progress_check"),
    run: (tx) => tx.pomodoroSession.create({ data: { status: "COMPLETED" } }),
  },
  {
    name: "pause without a pause timestamp",
    error: constraintError("PomodoroSession_progress_check"),
    run: (tx) => tx.pomodoroSession.create({ data: { status: "PAUSED" } }),
  },
  {
    name: "elapsed time beyond the planned duration",
    error: constraintError("PomodoroSession_progress_check"),
    run: (tx) =>
      tx.pomodoroSession.create({
        data: { plannedSeconds: 10, elapsedSeconds: 11 },
      }),
  },
  {
    name: "deleting a room owner before transferring or deleting their rooms",
    error: knownError("P2003"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.user.delete({ where: { id: user.id } });
    },
  },
  {
    name: "deleting a game that has recorded results",
    error: knownError("P2003"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      const game = await tx.miniGame.create({
        data: { key: randomUUID(), name: "Memory" },
      });
      await tx.gameResult.create({
        data: {
          userId: user.id,
          gameId: game.id,
          score: 1,
          durationSeconds: 1,
        },
      });
      return tx.miniGame.delete({ where: { id: game.id } });
    },
  },
  {
    name: "negative game duration",
    error: constraintError("GameResult_duration_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      const game = await tx.miniGame.create({
        data: { key: randomUUID(), name: "Memory" },
      });
      return tx.gameResult.create({
        data: {
          userId: user.id,
          gameId: game.id,
          score: 1,
          durationSeconds: -1,
        },
      });
    },
  },
];
for (const item of invalidCases) {
  void test(`database rejects ${item.name}`, async () => {
    await isolated(async (tx) => {
      await assert.rejects(() => item.run(tx), item.error);
    });
  });
}

void test("the migration upgrades existing users without losing profiles", async () => {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const schema = `upgrade_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    for (const migration of [
      "20261001114431_init",
      "20261001115727_remove_password",
    ]) {
      await client.query(
        await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
      );
    }
    await client.query(
      'INSERT INTO "User" ("email", "username", "updatedAt") VALUES ($1, $2, NOW())',
      ["legacy@example.test", "legacy"],
    );
    await client.query(
      await readFile(
        "prisma/migrations/20261006160000_study_platform/migration.sql",
        "utf8",
      ),
    );
    await client.query(
      await readFile(
        "prisma/migrations/20261006170000_timer_accounting/migration.sql",
        "utf8",
      ),
    );
    const result = await client.query<{
      id: number;
      email: string;
      username: string;
      passwordHash: string | null;
    }>('SELECT "id", "email", "username", "passwordHash" FROM "User"');
    assert.deepEqual(result.rows, [
      {
        id: 1,
        email: "legacy@example.test",
        username: "legacy",
        passwordHash: null,
      },
    ]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
