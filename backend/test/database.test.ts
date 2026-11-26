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
  return { user, friend, guest };
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
    });
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

void test("a guest is one row that can be deleted, and registered users are untouched", async () => {
  await isolated(async (tx) => {
    const { user, guest } = await fixtures(tx);
    await tx.userStat.create({
      data: { userId: user.id, focusedSeconds: 50 },
    });
    await tx.guestSession.delete({ where: { id: guest.id } });
    assert.equal(await tx.guestSession.count({ where: { id: guest.id } }), 0);
    assert.equal((await getUserStatistics(tx, user.id))?.focusedSeconds, 50);
  });
});

void test("rooms are not stored: there are no room tables", async () => {
  await isolated(async (tx) => {
    const tables = await tx.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()`;
    const names = tables.map((t) => t.table_name);
    for (const gone of ["PomodoroSession", "SessionMember", "StudyRoom"])
      assert.equal(names.includes(gone), false, `${gone} should not exist`);
    assert.ok(names.includes("UserStat"));
    assert.ok(names.includes("GuestSession"));
  });
});

void test("the role is only USER or ADMIN", async () => {
  await isolated(async (tx) => {
    const roles = await tx.$queryRaw<{ role: string }[]>`
      SELECT unnest(enum_range(NULL::"Role"))::text AS role`;
    assert.deepEqual(
      roles.map((r) => r.role),
      ["USER", "ADMIN"],
    );
    const { user } = await fixtures(tx);
    assert.equal(user.role, "USER");
  });
});

const invalidCases: {
  name: string;
  run: (tx: Prisma.TransactionClient) => Promise<unknown>;
  error: (error: unknown) => boolean;
}[] = [
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
