import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ApiError } from "../src/api/common.js";
import { cleanupExpiredSessions } from "../src/api/lifecycle.js";
import { createApp } from "../src/app.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { tokenHash } from "../src/auth/auth.service.js";
import { sweepTimers } from "../src/timers/timers.service.js";

const url = new URL(
  process.env.TEST_DATABASE_URL ??
    "postgresql://wepomodoro_test:local_test_only@127.0.0.1:55432/wepomodoro_test",
);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/wepomodoro_test" ||
  url.search ||
  url.hash
)
  throw new Error(
    "API tests require the dedicated local wepomodoro_test database",
  );
const connectionString = url.toString();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const prefix = `api${randomBytes(5).toString("hex")}`;
let clock = new Date();
const mails: { to: string; text: string }[] = [];
const ctx = {
  db,
  now: () => new Date(clock),
  mailer: {
    send: (to: string, _subject: string, text: string) => {
      mails.push({ to, text });
      return Promise.resolve();
    },
  },
};
let server: Server;
let base: string;
let count = 0;
const roomIds: string[] = [];
const timerIds: string[] = [];
const guestIds: string[] = [];
const errors: unknown[] = [];
interface Profile {
  id: number;
  username: string;
  email: string;
}
interface Auth {
  token: string;
  user: Profile;
}
interface GuestAuth {
  token: string;
  guest: { id: string; displayName: string };
}
interface Room {
  id: string;
  inviteCode: string;
  ownerId: number;
  members: {
    id: string;
    userId: number | null;
    guestSessionId: string | null;
  }[];
  timer: Timer | null;
}
interface Timer {
  id: string;
  status: string;
  remainingSeconds: number;
  elapsedSeconds: number;
  phase: string;
  plannedSeconds: number;
}
async function request<T>(
  path: string,
  method = "GET",
  token?: string,
  input?: unknown,
  expected = 200,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const result: unknown =
    response.status === 204 ? undefined : await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result as T;
}
async function user() {
  const name = `${prefix}${++count}`;
  return request<Auth>(
    "/api/auth/signup",
    "POST",
    undefined,
    {
      username: name,
      email: `${name}@example.test`,
      password: "Correct-password-42",
    },
    201,
  );
}
async function guest() {
  const result = await request<GuestAuth>(
    "/api/auth/guest",
    "POST",
    undefined,
    { displayName: prefix },
    201,
  );
  guestIds.push(result.guest.id);
  return result;
}
async function room(token: string, input: Record<string, unknown> = {}) {
  const result = await request<Room>(
    "/api/rooms",
    "POST",
    token,
    {
      name: prefix,
      focusSeconds: 10,
      shortBreakSeconds: 3,
      longBreakSeconds: 5,
      cyclesBeforeLongBreak: 2,
      ...input,
    },
    201,
  );
  roomIds.push(result.id);
  return result;
}
async function solo(token: string, input: Record<string, unknown> = {}) {
  const result = await request<Timer>(
    "/api/timers",
    "POST",
    token,
    { plannedSeconds: 10, ...input },
    201,
  );
  timerIds.push(result.id);
  return result;
}
async function shared(token: string, roomId: string) {
  const result = await request<Timer>(
    `/api/rooms/${roomId}/timers`,
    "POST",
    token,
    undefined,
    201,
  );
  timerIds.push(result.id);
  return result;
}
function advance(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}

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
  const app = createApp(ctx, {
    // The shared fixtures sign up dozens of users from one IP.
    rateLimits: {
      authPerMinute: 100000,
      loginFailures: 100000,
      resetRequests: 100000,
    },
    onError: (error) => {
      errors.push(error);
    },
    gameVerifiers: {
      [`${prefix}-memory`]: {
        verify: (userId, payload) => {
          if (
            !payload ||
            typeof payload !== "object" ||
            !("proof" in payload) ||
            payload.proof !== "valid-server-proof"
          )
            throw new ApiError(400, "Invalid proof");
          return { score: userId + 10, durationSeconds: 3 };
        },
      },
    },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  try {
    await db.$transaction(async (tx) => {
      await tx.studyRoom.deleteMany({ where: { id: { in: roomIds } } });
      await tx.pomodoroSession.deleteMany({ where: { id: { in: timerIds } } });
      await tx.guestSession.deleteMany({ where: { id: { in: guestIds } } });
      await tx.user.deleteMany({ where: { username: { startsWith: prefix } } });
      await tx.miniGame.deleteMany({ where: { key: { startsWith: prefix } } });
    });
  } finally {
    await db.$disconnect();
  }
  assert.deepEqual(errors, [], "API must not produce unexpected server errors");
});

void test("signup, login, hashed storage, profile updates and token revocation", async () => {
  const auth = await user();
  assert.equal(auth.token.length, 43);
  assert.equal("passwordHash" in auth.user, false);
  const stored = await db.user.findUniqueOrThrow({
    where: { id: auth.user.id },
  });
  assert.ok(stored.passwordHash?.startsWith("scrypt$"));
  assert.notEqual(stored.passwordHash, "Correct-password-42");
  assert.ok(
    await db.authSession.findUnique({
      where: { tokenHash: tokenHash(auth.token) },
    }),
  );
  const logged = await request<Auth>("/api/auth/login", "POST", undefined, {
    username: auth.user.username,
    password: "Correct-password-42",
  });
  await request(
    "/api/auth/login",
    "POST",
    undefined,
    { username: auth.user.username, password: "Wrong-password-42" },
    401,
  );
  await request(
    "/api/users/me",
    "PATCH",
    auth.token,
    { password: "Replacement-password-42" },
    401,
  );
  await request("/api/users/me", "PATCH", auth.token, {
    password: "Replacement-password-42",
    currentPassword: "Correct-password-42",
  });
  await request("/api/auth/me", "GET", logged.token, undefined, 401);
  await request("/api/auth/logout", "POST", auth.token, undefined, 204);
  await request("/api/auth/me", "GET", auth.token, undefined, 401);
});
void test("legacy profiles with no hash cannot log in, and directory does not expose email", async () => {
  const name = `${prefix}${++count}`;
  await db.user.create({
    data: { email: `${name}@example.test`, username: name },
  });
  await request(
    "/api/auth/login",
    "POST",
    undefined,
    { username: name, password: "Correct-password-42" },
    401,
  );
  const visitor = await guest();
  const directory = await request<{ id: number; username: string }[]>(
    "/api/users",
    "GET",
    visitor.token,
  );
  assert.ok(
    directory.every(
      (entry) => !("email" in entry) && !("passwordHash" in entry),
    ),
  );
  await request("/api/users/me/stats", "GET", visitor.token, undefined, 403);
  await request(
    "/api/rooms",
    "POST",
    visitor.token,
    { name: "Guest-owned room" },
    403,
  );
});
void test("authentication, validation, pagination and CORS reject bad requests", async () => {
  await request("/api/rooms", "GET", undefined, undefined, 401);
  await request(
    "/api/auth/signup",
    "POST",
    undefined,
    { username: "a", email: "bad", password: "short" },
    400,
  );
  const visitor = await guest();
  await request("/api/users?take=-1", "GET", visitor.token, undefined, 400);
  await request("/api/rooms/not-a-uuid", "GET", visitor.token, undefined, 400);
  await request(
    "/api/timers",
    "POST",
    visitor.token,
    { plannedSeconds: -1 },
    400,
  );
  const response = await fetch(`${base}/api/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
  const denied = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(denied.status, 403);
});
void test("room joins are idempotent, private, and controlled by registered owners", async () => {
  const owner = await user();
  const friend = await user();
  const visitor = await guest();
  const study = await room(owner.token);
  await request(`/api/rooms/${study.id}`, "GET", friend.token, undefined, 403);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  const joined = await request<Room>("/api/rooms/join", "POST", visitor.token, {
    inviteCode: study.inviteCode,
  });
  assert.equal(joined.members.length, 3);
  await request(
    `/api/rooms/${study.id}`,
    "PATCH",
    friend.token,
    { focusSeconds: 30 },
    403,
  );
  await request(
    `/api/rooms/${study.id}/leave`,
    "POST",
    owner.token,
    undefined,
    409,
  );
  const rotated = await request<Room>(
    `/api/rooms/${study.id}/invite-code`,
    "POST",
    owner.token,
  );
  await request(
    "/api/rooms/join",
    "POST",
    visitor.token,
    { inviteCode: study.inviteCode },
    404,
  );
  await request(`/api/rooms/${study.id}/owner`, "POST", owner.token, {
    userId: friend.user.id,
  });
  await request(
    `/api/rooms/${study.id}/leave`,
    "POST",
    owner.token,
    undefined,
    204,
  );
  const guestMember = joined.members.find(
    (member) => member.guestSessionId === visitor.guest.id,
  );
  assert.ok(guestMember);
  await request(
    `/api/rooms/${study.id}/members/${guestMember.id}`,
    "DELETE",
    friend.token,
    undefined,
    204,
  );
  await request(`/api/rooms/${study.id}`, "GET", visitor.token, undefined, 403);
  await request(`/api/rooms/${study.id}/close`, "POST", friend.token);
  await request(
    "/api/rooms/join",
    "POST",
    visitor.token,
    { inviteCode: rotated.inviteCode },
    409,
  );
});
void test("solo timers exclude paused time, prevent early completion and calculate statistics", async () => {
  const auth = await user();
  const timer = await solo(auth.token);
  await request("/api/timers", "POST", auth.token, { plannedSeconds: 10 }, 409);
  await request(
    `/api/timers/${timer.id}/complete`,
    "POST",
    auth.token,
    undefined,
    409,
  );
  advance(4);
  const liveStats = await request<{ focusedSeconds: number }>(
    "/api/users/me/stats",
    "GET",
    auth.token,
  );
  assert.equal(liveStats.focusedSeconds, 4);
  const paused = await request<Timer>(
    `/api/timers/${timer.id}/pause`,
    "POST",
    auth.token,
  );
  assert.equal(paused.elapsedSeconds, 4);
  advance(100);
  const frozen = await request<Timer>(
    `/api/timers/${timer.id}`,
    "GET",
    auth.token,
  );
  assert.equal(frozen.remainingSeconds, 6);
  await request(`/api/timers/${timer.id}/resume`, "POST", auth.token);
  advance(6);
  await request(`/api/timers/${timer.id}/complete`, "POST", auth.token);
  const stats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", auth.token);
  assert.equal(stats.focusedSeconds, 10);
  assert.equal(stats.completedFocusSessions, 1);
  await request(
    `/api/timers/${timer.id}/cancel`,
    "POST",
    auth.token,
    undefined,
    409,
  );
  const other = await guest();
  await request(`/api/timers/${timer.id}`, "GET", other.token, undefined, 404);
});
void test("shared timers credit late arrival and rejoining without crediting absence", async () => {
  const owner = await user();
  const friend = await user();
  const study = await room(owner.token);
  const timer = await shared(owner.token, study.id);
  advance(2);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  advance(2);
  await request(
    `/api/rooms/${study.id}/leave`,
    "POST",
    friend.token,
    undefined,
    204,
  );
  advance(2);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  await request(
    `/api/timers/${timer.id}/pause`,
    "POST",
    friend.token,
    undefined,
    403,
  );
  advance(4);
  await request(`/api/timers/${timer.id}`, "GET", owner.token);
  const stats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", friend.token);
  assert.equal(stats.focusedSeconds, 6);
  assert.equal(stats.completedFocusSessions, 0);
  const ownerStats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", owner.token);
  assert.equal(ownerStats.focusedSeconds, 10);
  assert.equal(ownerStats.completedFocusSessions, 1);
});
void test("room cycle alternates focus and breaks and ignores break time in study totals", async () => {
  const auth = await user();
  const study = await room(auth.token);
  for (const expected of [
    "FOCUS",
    "SHORT_BREAK",
    "FOCUS",
    "LONG_BREAK",
    "FOCUS",
  ]) {
    const timer = await shared(auth.token, study.id);
    assert.equal(timer.phase, expected);
    advance(timer.plannedSeconds);
    await sweepTimers(ctx);
  }
  const stats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", auth.token);
  assert.equal(stats.focusedSeconds, 30);
  assert.equal(stats.completedFocusSessions, 3);
});
void test("closing a room cancels its timer and keeps partial study time", async () => {
  const auth = await user();
  const study = await room(auth.token);
  const timer = await shared(auth.token, study.id);
  advance(3);
  await request(`/api/rooms/${study.id}/close`, "POST", auth.token);
  const stopped = await request<Timer>(
    `/api/timers/${timer.id}`,
    "GET",
    auth.token,
  );
  assert.equal(stopped.status, "CANCELLED");
  const stats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", auth.token);
  assert.equal(stats.focusedSeconds, 3);
  assert.equal(stats.completedFocusSessions, 0);
});
void test("guests can study solo and logout removes their temporary identity", async () => {
  const visitor = await guest();
  const timer = await solo(visitor.token);
  advance(2);
  await request("/api/auth/logout", "POST", visitor.token, undefined, 204);
  assert.equal(
    await db.guestSession.findUnique({ where: { id: visitor.guest.id } }),
    null,
  );
  assert.equal(
    (await db.pomodoroSession.findUniqueOrThrow({ where: { id: timer.id } }))
      .status,
    "CANCELLED",
  );
  await request("/api/auth/me", "GET", visitor.token, undefined, 401);
});
void test("minigame results require a registered user and a server-side verifier", async () => {
  const auth = await user();
  const visitor = await guest();
  const key = `${prefix}-memory`;
  await db.miniGame.createMany({
    data: [
      { key, name: "Test memory" },
      { key: `${prefix}-future`, name: "Future game" },
    ],
  });
  await request(
    `/api/games/${key}/results`,
    "POST",
    visitor.token,
    { score: 999 },
    403,
  );
  await request(
    `/api/games/${prefix}-future/results`,
    "POST",
    auth.token,
    { score: 999 },
    501,
  );
  await request(
    `/api/games/${key}/results`,
    "POST",
    auth.token,
    { score: 999999 },
    400,
  );
  await request(
    `/api/games/${key}/results`,
    "POST",
    auth.token,
    { proof: "valid-server-proof", score: 999999 },
    201,
  );
  const results = await request<{ score: number }[]>(
    "/api/users/me/game-results",
    "GET",
    auth.token,
  );
  assert.equal(results[0]?.score, auth.user.id + 10);
});
void test("simultaneous shared starts produce exactly one live timer", async () => {
  const auth = await user();
  const study = await room(auth.token);
  const responses = await Promise.all(
    [1, 2].map(async () =>
      fetch(`${base}/api/rooms/${study.id}/timers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  for (const response of responses)
    if (response.status === 201) {
      const value = (await response.json()) as Timer;
      timerIds.push(value.id);
    }
  assert.equal(
    await db.pomodoroSession.count({
      where: { roomId: study.id, status: "ACTIVE" },
    }),
    1,
  );
});
void test("deleting an account revokes sessions and preserves other users' shared history", async () => {
  const owner = await user();
  const friend = await user();
  const study = await room(owner.token);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  const timer = await shared(owner.token, study.id);
  advance(2);
  await request(
    "/api/users/me",
    "DELETE",
    owner.token,
    { password: "Wrong-password-42" },
    401,
  );
  await request(
    "/api/users/me",
    "DELETE",
    owner.token,
    { password: "Correct-password-42" },
    204,
  );
  await request("/api/auth/me", "GET", owner.token, undefined, 401);
  assert.equal(
    (await db.pomodoroSession.findUniqueOrThrow({ where: { id: timer.id } }))
      .roomId,
    null,
  );
  const stats = await request<{ focusedSeconds: number }>(
    "/api/users/me/stats",
    "GET",
    friend.token,
  );
  assert.equal(stats.focusedSeconds, 2);
});
void test("a person cannot accrue study time in overlapping solo and shared timers", async () => {
  const owner = await user();
  const friend = await user();
  const study = await room(owner.token);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  const own = await solo(friend.token);
  await request(
    `/api/rooms/${study.id}/timers`,
    "POST",
    owner.token,
    undefined,
    409,
  );
  await request(`/api/timers/${own.id}/cancel`, "POST", friend.token);
  const together = await shared(owner.token, study.id);
  await request(
    "/api/timers",
    "POST",
    friend.token,
    { plannedSeconds: 10 },
    409,
  );
  await request(`/api/timers/${together.id}/leave`, "POST", friend.token);
  await solo(friend.token);
  await request(
    `/api/timers/${together.id}/join`,
    "POST",
    friend.token,
    undefined,
    409,
  );
});
void test("simultaneous solo starts allow only one active timer", async () => {
  const visitor = await guest();
  const responses = await Promise.all(
    [1, 2].map(async () =>
      fetch(`${base}/api/timers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${visitor.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plannedSeconds: 10 }),
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  for (const response of responses)
    if (response.status === 201) {
      const value = (await response.json()) as Timer;
      timerIds.push(value.id);
    }
});
void test("joining during a pause does not credit paused time", async () => {
  const owner = await user();
  const friend = await user();
  const study = await room(owner.token);
  const timer = await shared(owner.token, study.id);
  advance(2);
  await request(`/api/timers/${timer.id}/pause`, "POST", owner.token);
  advance(30);
  await request("/api/rooms/join", "POST", friend.token, {
    inviteCode: study.inviteCode,
  });
  advance(30);
  await request(`/api/timers/${timer.id}/resume`, "POST", owner.token);
  advance(8);
  await sweepTimers(ctx);
  const stats = await request<{
    focusedSeconds: number;
    completedFocusSessions: number;
  }>("/api/users/me/stats", "GET", friend.token);
  assert.equal(stats.focusedSeconds, 8);
  assert.equal(stats.completedFocusSessions, 0);
});
void test("expired guest and registered tokens are rejected", async () => {
  const auth = await user();
  const visitor = await guest();
  advance(8 * 86400);
  await request("/api/auth/me", "GET", auth.token, undefined, 401);
  await request("/api/auth/me", "GET", visitor.token, undefined, 401);
});

void test("expired identity cleanup leaves registered study history intact", async () => {
  await sweepTimers(ctx);
  await cleanupExpiredSessions(ctx);
  assert.equal(
    await db.guestSession.count({ where: { id: { in: guestIds } } }),
    0,
  );
  assert.equal(
    await db.authSession.count({
      where: { user: { username: { startsWith: prefix } } },
    }),
    0,
  );
  assert.ok(
    (await db.sessionParticipant.count({
      where: { user: { username: { startsWith: prefix } } },
    })) > 0,
  );
});

void test("login failures are limited per username and token issuance per IP", async () => {
  const limited = createApp(ctx, {
    rateLimits: { authPerMinute: 6, loginFailures: 3, resetRequests: 3 },
    onError: (error) => {
      errors.push(error);
    },
  });
  const limitedServer = limited.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    limitedServer.once("listening", resolve);
  });
  try {
    const address = limitedServer.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/auth/login`;
    const attempt = (username: string) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "wrong-password" }),
      });
    for (let i = 0; i < 3; i++)
      assert.equal((await attempt(`Victim-${prefix}`)).status, 401);
    // Same account, different casing: blocked, with a Retry-After hint.
    const blocked = await attempt(`victim-${prefix}`);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.deepEqual(await blocked.json(), {
      error: "Too many failed logins for this account; try again later",
    });
    // A different account is unaffected until the per-IP limit (6 requests,
    // including the four above) is reached.
    assert.equal((await attempt(`other-${prefix}`)).status, 401);
    assert.equal((await attempt(`other2-${prefix}`)).status, 401);
    assert.equal((await attempt(`other3-${prefix}`)).status, 429);
    // Reads aren't counted.
    const health = await fetch(url.replace("/auth/login", "/health"));
    assert.equal(health.status, 200);
  } finally {
    await new Promise<void>((resolve) => {
      limitedServer.close(() => {
        resolve();
      });
    });
  }
});

void test("password reset: emailed code, verified, then a new password ends every session", async () => {
  const account = await user();
  const other = await user();
  const post = <T>(path: string, input: unknown, expected: number) =>
    request<T>(
      `/api/auth/password-reset/${path}`,
      "POST",
      undefined,
      input,
      expected,
    );
  const lastCode = () => {
    const mail = mails.at(-1);
    assert.ok(mail);
    const match = /code is (\d{6})/.exec(mail.text);
    assert.ok(match?.[1]);
    return { to: mail.to, code: match[1] };
  };
  const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

  // Unknown addresses get the same answer and no email.
  const before = mails.length;
  const unknown = await post<{ message: string }>(
    "request",
    { email: `nobody-${prefix}@example.test` },
    202,
  );
  assert.equal(mails.length, before);
  const known = await post<{ message: string }>(
    "request",
    { email: account.user.email },
    202,
  );
  assert.deepEqual(known, unknown);
  assert.equal(mails.length, before + 1);
  const first = lastCode();
  assert.equal(first.to, account.user.email);
  // Only a hash of the code is stored.
  const rows = await db.emailToken.findMany({
    where: { userId: account.user.id, purpose: "PASSWORD_RESET_CODE" },
  });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0]?.tokenHash, first.code);

  // Bad input and wrong codes fail identically; five misses lock that code.
  await post("verify", { email: account.user.email, code: "12" }, 400);
  for (let i = 0; i < 5; i++)
    await post(
      "verify",
      { email: account.user.email, code: wrong(first.code) },
      400,
    );
  await post("verify", { email: account.user.email, code: first.code }, 400);
  // A code for someone else's account is useless.
  await post("verify", { email: other.user.email, code: first.code }, 400);

  // A new request replaces the locked code; the old one stops working.
  await post("request", { email: account.user.email }, 202);
  const second = lastCode();
  await post(
    "verify",
    {
      email: account.user.email,
      code: first.code === second.code ? wrong(first.code) : first.code,
    },
    400,
  );
  const verified = await post<{ resetToken: string }>(
    "verify",
    { email: account.user.email, code: second.code },
    200,
  );
  // The code is single use.
  await post("verify", { email: account.user.email, code: second.code }, 400);

  // The reset token must come with a valid new password and works once.
  await post(
    "confirm",
    { resetToken: verified.resetToken, password: "short" },
    400,
  );
  await post(
    "confirm",
    { resetToken: "not-a-token", password: "Brand-new-pass-1" },
    400,
  );
  await post(
    "confirm",
    { resetToken: verified.resetToken, password: "Brand-new-pass-1" },
    204,
  );
  await post(
    "confirm",
    { resetToken: verified.resetToken, password: "Another-pass-2" },
    400,
  );

  // Old sessions are revoked and only the new password logs in.
  await request("/api/auth/me", "GET", account.token, undefined, 401);
  await request(
    "/api/auth/login",
    "POST",
    undefined,
    { username: account.user.username, password: "Correct-password-42" },
    401,
  );
  await request(
    "/api/auth/login",
    "POST",
    undefined,
    { username: account.user.username, password: "Brand-new-pass-1" },
    200,
  );
  // Other accounts are untouched.
  await request("/api/auth/me", "GET", other.token, undefined, 200);

  // Codes expire after 10 minutes.
  await post("request", { email: account.user.email }, 202);
  const stale = lastCode();
  const now = clock;
  clock = new Date(now.getTime() + 11 * 60_000);
  try {
    await post("verify", { email: account.user.email, code: stale.code }, 400);
    await cleanupExpiredSessions(ctx);
    assert.equal(
      await db.emailToken.count({
        where: {
          userId: account.user.id,
          purpose: "PASSWORD_RESET_CODE",
          usedAt: null,
        },
      }),
      0,
    );
  } finally {
    clock = now;
  }
});

void test("password reset requests are limited per address", async () => {
  const account = await user();
  const limited = createApp(ctx, {
    rateLimits: { authPerMinute: 100, loginFailures: 100, resetRequests: 2 },
    onError: (error) => {
      errors.push(error);
    },
  });
  const limitedServer = limited.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    limitedServer.once("listening", resolve);
  });
  try {
    const address = limitedServer.address();
    assert.ok(address && typeof address !== "string");
    const ask = (email: string) =>
      fetch(
        `http://127.0.0.1:${address.port}/api/auth/password-reset/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
    assert.equal((await ask(account.user.email)).status, 202);
    assert.equal((await ask(account.user.email.toUpperCase())).status, 202);
    assert.equal((await ask(account.user.email)).status, 429);
    assert.equal((await ask(`x-${prefix}@example.test`)).status, 202);
  } finally {
    await new Promise<void>((resolve) => {
      limitedServer.close(() => {
        resolve();
      });
    });
  }
});

void test("email verification: signup emails a code that proves the address", async () => {
  const before = mails.length;
  const account = await user();
  const mail = mails.slice(before).find((m) => m.to === account.user.email);
  assert.ok(mail);
  const code = /code is (\d{6})/.exec(mail.text)?.[1];
  assert.ok(code);
  const wrong = code === "000000" ? "111111" : "000000";
  const post = (
    path: string,
    token: string,
    input: unknown,
    expected: number,
  ) => request(`/api/auth/verify-email${path}`, "POST", token, input, expected);

  const verified = async () =>
    (await db.user.findUniqueOrThrow({ where: { id: account.user.id } }))
      .emailVerifiedAt;
  assert.equal(await verified(), null);
  // Guests have no email to verify; the code must be six digits.
  const visitor = await guest();
  await post("", visitor.token, { code }, 403);
  await post("", account.token, { code: "12" }, 400);
  await post("", account.token, { code: wrong }, 400);
  await post("", undefined as unknown as string, { code }, 401);
  await post("", account.token, { code }, 204);
  assert.ok(await verified());
  const me = await request<{ profile: { emailVerifiedAt: string | null } }>(
    "/api/auth/me",
    "GET",
    account.token,
  );
  assert.ok(me.profile.emailVerifiedAt);
  // Already verified: no more codes.
  await post("/resend", account.token, {}, 409);

  // Changing the address clears verification until the new one is proven.
  await request("/api/users/me", "PATCH", account.token, {
    email: `new-${account.user.email}`,
    currentPassword: "Correct-password-42",
  });
  assert.equal(await verified(), null);
  await post("/resend", account.token, {}, 202);
  const latest = mails.at(-1);
  assert.equal(latest?.to, `new-${account.user.email}`);
  const fresh = /code is (\d{6})/.exec(latest.text)?.[1];
  assert.ok(fresh);
  // The five-miss lock applies to the current code.
  for (let i = 0; i < 5; i++)
    await post(
      "",
      account.token,
      { code: fresh === wrong ? "222222" : wrong },
      400,
    );
  await post("", account.token, { code: fresh }, 400);
  await post("/resend", account.token, {}, 202);
  const again = /code is (\d{6})/.exec(mails.at(-1)?.text ?? "")?.[1];
  assert.ok(again);
  await post("", account.token, { code: again }, 204);
  assert.ok(await verified());
});
