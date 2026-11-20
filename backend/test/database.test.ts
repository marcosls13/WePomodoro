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
  const room = await tx.pomodoroSession.create({
    data: {
      name: "Study together",
      code: key,
      members: { create: { userId: user.id, isOwner: true } },
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

void test("registered users and guests join a session found by its code", async () => {
  await isolated(async (tx) => {
    const { friend, guest, room } = await fixtures(tx);
    const found = await tx.pomodoroSession.findUniqueOrThrow({
      where: { code: room.code ?? "" },
    });
    await tx.sessionMember.createMany({
      data: [
        { sessionId: found.id, userId: friend.id },
        { sessionId: found.id, guestSessionId: guest.id },
      ],
    });
    assert.equal(
      await tx.sessionMember.count({ where: { sessionId: room.id } }),
      3,
    );
    assert.equal(found.focusSeconds, 1500);
    assert.equal(found.breakSeconds, 300);
    assert.equal(found.timerStatus, "IDLE");
  });
});

void test("leaving a session deletes the membership so it can be recreated", async () => {
  await isolated(async (tx) => {
    const { user, room } = await fixtures(tx);
    await tx.sessionMember.delete({
      where: { sessionId_userId: { sessionId: room.id, userId: user.id } },
    });
    await tx.sessionMember.create({
      data: { sessionId: room.id, userId: user.id },
    });
    assert.equal(
      await tx.sessionMember.count({ where: { sessionId: room.id } }),
      1,
    );
  });
});

void test("a friendship exists once per pair, in either direction", async () => {
  await isolated(async (tx) => {
    const { user, friend } = await fixtures(tx);
    await tx.friendship.create({
      data: { requesterId: user.id, addresseeId: friend.id },
    });
    await assert.rejects(
      tx.$transaction((inner) =>
        inner.friendship.create({
          data: { requesterId: friend.id, addresseeId: user.id },
        }),
      ),
      constraintError("Friendship_pair_key"),
    );
  });
});

void test("registered users and guests can each study alone, in a session nobody can join", async () => {
  await isolated(async (tx) => {
    const { user, guest } = await fixtures(tx);
    const solo = await tx.pomodoroSession.create({
      data: {
        name: "Solo",
        members: { create: { userId: user.id, isOwner: true } },
      },
      include: { members: true },
    });
    const guestSolo = await tx.pomodoroSession.create({
      data: {
        name: "Guest solo",
        members: { create: { guestSessionId: guest.id, isOwner: true } },
      },
      include: { members: true },
    });
    assert.equal(solo.code, null);
    assert.equal(guestSolo.code, null);
    assert.equal(solo.members[0]?.userId, user.id);
    assert.equal(guestSolo.members[0]?.guestSessionId, guest.id);
  });
});

void test("a shared timer can be paused and resumed, and changing settings keeps the phase snapshot", async () => {
  await isolated(async (tx) => {
    const { room } = await fixtures(tx);
    const now = new Date();
    await tx.pomodoroSession.update({
      where: { id: room.id },
      data: { timerStatus: "RUNNING", resumedAt: now },
    });
    await tx.pomodoroSession.update({
      where: { id: room.id },
      data: { timerStatus: "PAUSED", resumedAt: null, elapsedSeconds: 600 },
    });
    await tx.pomodoroSession.update({
      where: { id: room.id },
      data: { timerStatus: "RUNNING", resumedAt: now },
    });
    await tx.pomodoroSession.update({
      where: { id: room.id },
      data: { focusSeconds: 1800 },
    });
    const session = await tx.pomodoroSession.findUniqueOrThrow({
      where: { id: room.id },
    });
    assert.equal(session.elapsedSeconds, 600);
  });
});

void test("statistics isolate users and add wins and losses across games", async () => {
  await isolated(async (tx) => {
    const { user, friend } = await fixtures(tx);
    await tx.userStat.create({
      data: { userId: user.id, focusedSeconds: 1800, wins: 2, losses: 1 },
    });
    await tx.userStat.create({
      data: { userId: friend.id, focusedSeconds: 999, wins: 7 },
    });
    assert.deepEqual(await getUserStatistics(tx, user.id), {
      focusedSeconds: 1800,
      wins: 2,
      losses: 1,
      played: 3,
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
      wins: 0,
      losses: 0,
      played: 0,
    });
  });
});

void test("deleting a guest removes its membership without affecting registered users", async () => {
  await isolated(async (tx) => {
    const { user, guest, room } = await fixtures(tx);
    await tx.sessionMember.create({
      data: { sessionId: room.id, guestSessionId: guest.id },
    });
    await tx.userStat.create({
      data: { userId: user.id, focusedSeconds: 50 },
    });
    await tx.guestSession.delete({ where: { id: guest.id } });
    assert.equal(
      await tx.sessionMember.count({ where: { guestSessionId: guest.id } }),
      0,
    );
    assert.equal(
      await tx.sessionMember.count({ where: { sessionId: room.id } }),
      1,
    );
    assert.equal((await getUserStatistics(tx, user.id))?.focusedSeconds, 50);
  });
});

void test("deleting a session keeps its members' lifetime statistics", async () => {
  await isolated(async (tx) => {
    const { user, room } = await fixtures(tx);
    await tx.userStat.create({
      data: { userId: user.id, focusedSeconds: 50 },
    });
    await tx.pomodoroSession.delete({ where: { id: room.id } });
    assert.equal(
      await tx.sessionMember.count({ where: { sessionId: room.id } }),
      0,
    );
    assert.equal((await getUserStatistics(tx, user.id))?.focusedSeconds, 50);
  });
});

void test("deleting a user cascades email tokens and login challenges", async () => {
  await isolated(async (tx) => {
    const { friend } = await fixtures(tx);
    const expiresAt = new Date(Date.now() + 3600000);
    await tx.emailToken.create({
      data: {
        userId: friend.id,
        purpose: "PASSWORD_RESET",
        email: friend.email,
        tokenHash: randomUUID(),
        expiresAt,
      },
    });
    await tx.emailToken.create({
      data: {
        userId: friend.id,
        purpose: "TWO_FACTOR_ENABLE_CODE",
        email: friend.email,
        tokenHash: randomUUID(),
        expiresAt,
      },
    });
    await tx.loginChallenge.create({
      data: {
        userId: friend.id,
        tokenHash: randomUUID(),
        codeHash: randomUUID(),
        expiresAt,
      },
    });
    await tx.oAuthAccount.create({
      data: {
        userId: friend.id,
        provider: "GITHUB",
        providerUserId: randomUUID(),
      },
    });
    await tx.oAuthCode.create({
      data: { userId: friend.id, codeHash: randomUUID(), expiresAt },
    });
    await tx.user.delete({ where: { id: friend.id } });
    const where = { userId: friend.id };
    assert.equal(await tx.emailToken.count({ where }), 0);
    assert.equal(await tx.loginChallenge.count({ where }), 0);
    assert.equal(await tx.oAuthAccount.count({ where }), 0);
    assert.equal(await tx.oAuthCode.count({ where }), 0);
  });
});

void test("deleting a user cascades authentication and statistics", async () => {
  await isolated(async (tx) => {
    const { friend } = await fixtures(tx);
    await tx.authSession.create({
      data: {
        userId: friend.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await tx.userStat.create({ data: { userId: friend.id, wins: 1 } });
    await tx.user.delete({ where: { id: friend.id } });
    assert.equal(
      await tx.authSession.count({ where: { userId: friend.id } }),
      0,
    );
    assert.equal(await tx.userStat.count({ where: { userId: friend.id } }), 0);
  });
});

const invalidCases: {
  name: string;
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
  error: (error: unknown) => boolean;
}[] = [
  {
    name: "duplicate session codes",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      return tx.pomodoroSession.create({
        data: { name: "Copy", code: room.code },
      });
    },
  },
  {
    name: "duplicate registered memberships",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room, user } = await fixtures(tx);
      return tx.sessionMember.create({
        data: { sessionId: room.id, userId: user.id },
      });
    },
  },
  {
    name: "duplicate guest memberships",
    error: knownError("P2002"),
    run: async (tx) => {
      const { room, guest } = await fixtures(tx);
      await tx.sessionMember.create({
        data: { sessionId: room.id, guestSessionId: guest.id },
      });
      return tx.sessionMember.create({
        data: { sessionId: room.id, guestSessionId: guest.id },
      });
    },
  },
  {
    name: "a friendship with yourself",
    error: constraintError("Friendship_distinct_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.friendship.create({
        data: { requesterId: user.id, addresseeId: user.id },
      });
    },
  },
  {
    name: "membership without an identity",
    error: constraintError("SessionMember_identity_check"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      return tx.sessionMember.create({ data: { sessionId: room.id } });
    },
  },
  {
    name: "membership with both identities",
    error: constraintError("SessionMember_identity_check"),
    run: async (tx) => {
      const { room, user, guest } = await fixtures(tx);
      return tx.sessionMember.create({
        data: {
          sessionId: room.id,
          userId: user.id,
          guestSessionId: guest.id,
        },
      });
    },
  },
  {
    name: "a second owner in a session",
    error: constraintError("SessionMember_one_owner_per_session"),
    run: async (tx) => {
      const { room, friend } = await fixtures(tx);
      return tx.sessionMember.create({
        data: { sessionId: room.id, userId: friend.id, isOwner: true },
      });
    },
  },
  {
    name: "crediting a member before they joined",
    error: constraintError("SessionMember_progress_check"),
    run: async (tx) => {
      const { room, friend } = await fixtures(tx);
      return tx.sessionMember.create({
        data: {
          sessionId: room.id,
          userId: friend.id,
          joinedAt: new Date(),
          creditedAt: new Date(Date.now() - 60000),
        },
      });
    },
  },
  {
    name: "invalid session durations",
    error: constraintError("PomodoroSession_settings_check"),
    run: async (tx) => {
      const { room } = await fixtures(tx);
      return tx.pomodoroSession.update({
        where: { id: room.id },
        data: { focusSeconds: 0 },
      });
    },
  },
  {
    name: "a running timer without a start time",
    error: constraintError("PomodoroSession_timer_check"),
    run: (tx) =>
      tx.pomodoroSession.create({
        data: { name: "Bad", timerStatus: "RUNNING" },
      }),
  },
  {
    name: "a paused timer that still has a start time",
    error: constraintError("PomodoroSession_timer_check"),
    run: (tx) =>
      tx.pomodoroSession.create({
        data: { name: "Bad", timerStatus: "PAUSED", resumedAt: new Date() },
      }),
  },
  {
    name: "negative elapsed time",
    error: constraintError("PomodoroSession_timer_check"),
    run: (tx) =>
      tx.pomodoroSession.create({
        data: { name: "Bad", elapsedSeconds: -1 },
      }),
  },
  {
    name: "negative statistics",
    error: constraintError("UserStat_totals_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.userStat.create({ data: { userId: user.id, losses: -1 } });
    },
  },
  {
    name: "statistics for a user that does not exist",
    error: knownError("P2003"),
    run: (tx) => tx.userStat.create({ data: { userId: -1 } }),
  },
  {
    name: "an email token that expires before it was created",
    error: constraintError("EmailToken_validity_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.emailToken.create({
        data: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          email: user.email,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() - 3600000),
        },
      });
    },
  },
  {
    name: "duplicate email token hashes",
    error: knownError("P2002"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      const data = {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION" as const,
        email: user.email,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      };
      await tx.emailToken.create({ data });
      return tx.emailToken.create({ data });
    },
  },
  {
    name: "the same provider identity linked to two users",
    error: knownError("P2002"),
    run: async (tx) => {
      const { user, friend } = await fixtures(tx);
      const providerUserId = randomUUID();
      await tx.oAuthAccount.create({
        data: { userId: user.id, provider: "GOOGLE", providerUserId },
      });
      return tx.oAuthAccount.create({
        data: { userId: friend.id, provider: "GOOGLE", providerUserId },
      });
    },
  },
  {
    name: "a second link to the same provider for one user",
    error: knownError("P2002"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: "GOOGLE",
          providerUserId: randomUUID(),
        },
      });
      return tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: "GOOGLE",
          providerUserId: randomUUID(),
        },
      });
    },
  },
  {
    name: "a login challenge with negative failed attempts",
    error: constraintError("LoginChallenge_validity_check"),
    run: async (tx) => {
      const { user } = await fixtures(tx);
      return tx.loginChallenge.create({
        data: {
          userId: user.id,
          tokenHash: randomUUID(),
          codeHash: randomUUID(),
          expiresAt: new Date(Date.now() + 300000),
          failedAttempts: -1,
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
