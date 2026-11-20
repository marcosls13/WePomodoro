import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { cleanupExpiredSessions } from "../src/api/lifecycle.js";
import { createApp } from "../src/app.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { tokenHash } from "../src/auth/auth.service.js";
import type {
  OAuthProfile,
  OAuthProviderConfig,
} from "../src/auth/oauth.providers.js";
import { recordMatch } from "../src/stats/stats.service.js";
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
// Fake providers: the profile comes from a table keyed by the "code".
const profiles = new Map<string, OAuthProfile>();
// Logins asked of the fake 42: `real42` exists, `boom` makes the lookup fail.
const lookups: string[] = [];
const fake = (
  id: OAuthProviderConfig["id"],
  dbValue: OAuthProviderConfig["dbValue"],
): OAuthProviderConfig => ({
  id,
  dbValue,
  authorizeUrl: (state) => `http://provider.test/${id}?state=${state}`,
  profile: (code) => {
    const profile = profiles.get(code);
    return profile
      ? Promise.resolve(profile)
      : Promise.reject(new Error("Unknown fake code"));
  },
});
const ctx = {
  db,
  now: () => new Date(clock),
  mailer: {
    send: (to: string, _subject: string, text: string) => {
      mails.push({ to, text });
      return Promise.resolve();
    },
  },
  oauth: new Map([
    ["google", fake("google", "GOOGLE")],
    [
      "42",
      {
        ...fake("42", "FORTY_TWO"),
        loginExists: (login: string) => {
          lookups.push(login);
          if (login === `${prefix}boom`)
            return Promise.reject(new Error("42 is down"));
          return Promise.resolve(login === `${prefix}real42`);
        },
      },
    ],
  ]),
};
let server: Server;
let base: string;
let count = 0;
const sessionIds: string[] = [];
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
interface Session {
  id: string;
  code: string | null;
  timerStatus: string;
  phase: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  members: {
    id: string;
    userId: number | null;
    guestSessionId: string | null;
    isOwner: boolean;
    isGuest: boolean;
    mutedUntil: string | null;
  }[];
}
interface Stats {
  focusedSeconds: number;
  wins: number;
  losses: number;
  played: number;
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
interface Pending {
  pendingToken: string;
  expiresAt: string;
}
// The code the fake mailer last sent to an address.
function codeFor(to: string) {
  const mail = [...mails].reverse().find((m) => m.to === to);
  const code = /code is (\d{6})/.exec(mail?.text ?? "")?.[1];
  assert.ok(code, `no code was emailed to ${to}`);
  return code;
}
const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");
function signup(
  name: string,
  expected = 202,
  over: Record<string, unknown> = {},
) {
  return request<Pending>(
    "/api/auth/signup",
    "POST",
    undefined,
    {
      username: name,
      email: `${name}@example.test`,
      password: "Correct-password-42",
      ...over,
    },
    expected,
  );
}
const pendingPost = (path: string, input: unknown, expected: number) =>
  request(`/api/auth/signup${path}`, "POST", undefined, input, expected);
// Signing up needs the emailed code. `verified = false` then turns the account
// into an older unverified one (as after an email change) with a deadline.
async function user(verified = true) {
  const name = `${prefix}${++count}`;
  const { pendingToken } = await signup(name);
  const account = await request<Auth>(
    "/api/auth/signup/verify",
    "POST",
    undefined,
    { pendingToken, code: codeFor(`${name}@example.test`) },
    201,
  );
  if (!verified)
    await db.user.update({
      where: { id: account.user.id },
      data: { emailVerifiedAt: null },
    });
  return account;
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
async function makeSession(token: string, input: Record<string, unknown> = {}) {
  const result = await request<Session>(
    "/api/sessions",
    "POST",
    token,
    {
      name: prefix,
      focusSeconds: 10,
      breakSeconds: 3,
      ...input,
    },
    201,
  );
  sessionIds.push(result.id);
  return result;
}
const joinCode = (token: string, code: string | null, expected = 200) =>
  request<Session>("/api/sessions/join", "POST", token, { code }, expected);
const act = (
  token: string,
  sessionId: string,
  action: "start" | "pause" | "resume" | "cancel",
  expected = 200,
) =>
  request<Session>(
    `/api/sessions/${sessionId}/timer/${action}`,
    "POST",
    token,
    undefined,
    expected,
  );
const myStats = (token: string) =>
  request<Stats>("/api/users/me/stats", "GET", token);
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
      await tx.pomodoroSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
      await tx.guestSession.deleteMany({ where: { id: { in: guestIds } } });
      await tx.pendingSignup.deleteMany({
        where: { email: { startsWith: prefix } },
      });
      await tx.user.deleteMany({ where: { username: { startsWith: prefix } } });
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
  // Guests can own sessions; they just keep no statistics.
  const own = await makeSession(visitor.token);
  assert.equal(own.members[0]?.isGuest, true);
  assert.equal(own.members[0]?.isOwner, true);
});
void test("authentication, validation, pagination and CORS reject bad requests", async () => {
  await request("/api/sessions", "GET", undefined, undefined, 401);
  await request(
    "/api/auth/signup",
    "POST",
    undefined,
    { username: "a", email: "bad", password: "short" },
    400,
  );
  const visitor = await guest();
  await request("/api/users?take=-1", "GET", visitor.token, undefined, 400);
  await request(
    "/api/sessions/not-a-uuid",
    "GET",
    visitor.token,
    undefined,
    400,
  );
  await request(
    "/api/sessions",
    "POST",
    visitor.token,
    { name: prefix, focusSeconds: -1 },
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
void test("session joins are idempotent, private, and the owner controls the code and ownership", async () => {
  const owner = await user();
  const friend = await user();
  const visitor = await guest();
  const study = await makeSession(owner.token);
  const path = `/api/sessions/${study.id}`;
  await request(path, "GET", friend.token, undefined, 403);
  await joinCode(friend.token, study.code);
  await joinCode(friend.token, study.code);
  const joined = await joinCode(visitor.token, study.code);
  assert.equal(joined.members.length, 3);
  await request(path, "PATCH", friend.token, { focusSeconds: 30 }, 403);
  // Only the owner can replace the code, and the old one stops working.
  for (const other of [friend, visitor])
    await request(`${path}/code`, "POST", other.token, undefined, 403);
  const rotated = await request<{ code: string }>(
    `${path}/code`,
    "POST",
    owner.token,
  );
  assert.notEqual(rotated.code, study.code);
  const stranger = await user();
  await joinCode(stranger.token, study.code, 404);
  await joinCode(stranger.token, "nope", 404);
  // Ownership moves to another member; the old owner may then leave.
  const friendMember = joined.members.find((m) => m.userId === friend.user.id);
  assert.ok(friendMember);
  await request(`${path}/owner`, "POST", owner.token, {
    memberId: friendMember.id,
  });
  await request(`${path}/leave`, "POST", owner.token, undefined, 204);
  const guestMember = joined.members.find(
    (member) => member.guestSessionId === visitor.guest.id,
  );
  assert.ok(guestMember);
  await request(
    `${path}/members/${guestMember.id}`,
    "DELETE",
    friend.token,
    undefined,
    204,
  );
  await request(path, "GET", visitor.token, undefined, 403);
  // A kicked member can come back with the current code.
  await joinCode(visitor.token, rotated.code);
  // A deleted session can no longer be joined.
  await request(path, "DELETE", friend.token, undefined, 204);
  await joinCode(visitor.token, rotated.code, 404);
});
void test("membership persists until the person leaves or is kicked", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  const path = `/api/sessions/${study.id}`;
  await joinCode(friend.token, study.code);
  const listed = await request<{ id: string }[]>(
    "/api/sessions",
    "GET",
    friend.token,
  );
  assert.ok(listed.some((r) => r.id === study.id));
  await request(path, "GET", friend.token);
  // Joining again with a code is a no-op for an existing member.
  const again = await joinCode(friend.token, study.code);
  assert.equal(again.members.length, 2);
  // Leaving removes the membership; a code is needed to return.
  await request(`${path}/leave`, "POST", friend.token, undefined, 204);
  await request(path, "GET", friend.token, undefined, 403);
  const rejoined = await joinCode(friend.token, study.code);
  // Kicked members need a code again too.
  const member = rejoined.members.find((m) => m.userId === friend.user.id);
  assert.ok(member);
  await request(
    `${path}/members/${member.id}`,
    "DELETE",
    owner.token,
    undefined,
    204,
  );
  await request(path, "GET", friend.token, undefined, 403);
  await joinCode(friend.token, study.code);
  await request(path, "GET", friend.token);
});
void test("friends: request, accept, list and remove", async () => {
  const alice = await user();
  const bob = await user();
  const visitor = await guest();
  await request("/api/friends", "GET", visitor.token, undefined, 403);
  await request(
    "/api/friends",
    "POST",
    alice.token,
    { username: alice.user.username },
    400,
  );
  await request(
    "/api/friends",
    "POST",
    alice.token,
    { username: "nobody-" + prefix },
    404,
  );
  const sent = await request<{ id: string }>(
    "/api/friends",
    "POST",
    alice.token,
    { username: bob.user.username },
    201,
  );
  await request(
    "/api/friends",
    "POST",
    alice.token,
    { username: bob.user.username },
    409,
  );
  type Lists = Record<"friends" | "incoming" | "outgoing", { id: string }[]>;
  const aliceView = await request<Lists>("/api/friends", "GET", alice.token);
  assert.equal(aliceView.outgoing.length, 1);
  const bobView = await request<Lists>("/api/friends", "GET", bob.token);
  assert.equal(bobView.incoming.length, 1);
  // Only the addressee can accept.
  await request(
    `/api/friends/${sent.id}/accept`,
    "POST",
    alice.token,
    undefined,
    404,
  );
  await request(
    `/api/friends/${sent.id}/accept`,
    "POST",
    bob.token,
    undefined,
    204,
  );
  const after = await request<Lists>("/api/friends", "GET", alice.token);
  assert.equal(after.friends.length, 1);
  assert.equal(after.outgoing.length, 0);
  await request(`/api/friends/${sent.id}`, "DELETE", bob.token, undefined, 204);
  const gone = await request<Lists>("/api/friends", "GET", alice.token);
  assert.equal(gone.friends.length, 0);
  // A crossed request is accepted instead of duplicated.
  await request(
    "/api/friends",
    "POST",
    alice.token,
    { username: bob.user.username },
    201,
  );
  await request(
    "/api/friends",
    "POST",
    bob.token,
    { username: alice.user.username },
    201,
  );
  const crossed = await request<Lists>("/api/friends", "GET", bob.token);
  assert.equal(crossed.friends.length, 1);
});
void test("friends see the shared session someone is in and whether they joined it", async () => {
  const alice = await user();
  const bob = await user();
  const carol = await user();
  const study = await makeSession(alice.token);
  // A solo timer is private: friends never see it.
  await makeSession(carol.token, { solo: true });
  interface Friend {
    id: string;
    user: { id: number };
    presence: { session?: { id: string; joined: boolean } };
  }
  const befriend = async (other: Auth) => {
    const sent = await request<{ id: string }>(
      "/api/friends",
      "POST",
      bob.token,
      { username: other.user.username },
      201,
    );
    await request(
      `/api/friends/${sent.id}/accept`,
      "POST",
      other.token,
      undefined,
      204,
    );
  };
  await befriend(alice);
  await befriend(carol);
  const list = async () =>
    (await request<{ friends: Friend[] }>("/api/friends", "GET", bob.token))
      .friends;
  const of = (friends: Friend[], other: Auth) =>
    friends.find((f) => f.user.id === other.user.id)?.presence.session;
  const seen = await list();
  assert.equal(of(seen, alice)?.id, study.id);
  assert.equal(of(seen, alice)?.joined, false);
  assert.equal(of(seen, carol), undefined);
  // Joining with the code flips `joined` for the friend.
  await joinCode(bob.token, study.code);
  assert.equal(of(await list(), alice)?.joined, true);
  // A deleted session is no longer shown.
  await request(
    `/api/sessions/${study.id}`,
    "DELETE",
    alice.token,
    undefined,
    204,
  );
  assert.equal(of(await list(), alice), undefined);
});
void test("solo timers exclude paused time and credit the focus time", async () => {
  const auth = await user();
  const solo = await makeSession(auth.token, { solo: true });
  assert.equal(solo.code, null);
  await joinCode(auth.token, null, 400);
  await act(auth.token, solo.id, "start");
  await act(auth.token, solo.id, "start", 409);
  // Settings only change between phases.
  await request(
    `/api/sessions/${solo.id}`,
    "PATCH",
    auth.token,
    { focusSeconds: 20 },
    409,
  );
  advance(4);
  assert.equal((await myStats(auth.token)).focusedSeconds, 4);
  const paused = await act(auth.token, solo.id, "pause");
  assert.equal(paused.elapsedSeconds, 4);
  advance(100);
  const frozen = await request<Session>(
    `/api/sessions/${solo.id}`,
    "GET",
    auth.token,
  );
  assert.equal(frozen.remainingSeconds, 6);
  await act(auth.token, solo.id, "resume");
  advance(6);
  // The phase ran out: everyone is credited and the next phase waits, idle.
  assert.equal((await myStats(auth.token)).focusedSeconds, 10);
  const next = await request<Session>(
    `/api/sessions/${solo.id}`,
    "GET",
    auth.token,
  );
  assert.equal(next.timerStatus, "IDLE");
  assert.equal(next.phase, "BREAK");
  // Only members can see it, and a solo timer has no code to join with.
  const other = await guest();
  await request(`/api/sessions/${solo.id}`, "GET", other.token, undefined, 403);
});
void test("shared timers credit late arrival and rejoining without crediting absence", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  await act(owner.token, study.id, "start");
  advance(2);
  await joinCode(friend.token, study.code);
  advance(2);
  await request(
    `/api/sessions/${study.id}/leave`,
    "POST",
    friend.token,
    undefined,
    204,
  );
  advance(2);
  await joinCode(friend.token, study.code);
  // Only the owner drives the timer.
  await act(friend.token, study.id, "pause", 403);
  advance(4);
  assert.equal((await myStats(friend.token)).focusedSeconds, 6);
  assert.equal((await myStats(owner.token)).focusedSeconds, 10);
});
void test("the cycle alternates focus and breaks and ignores break time in study totals", async () => {
  const auth = await user();
  const study = await makeSession(auth.token);
  for (const expected of ["FOCUS", "BREAK", "FOCUS", "BREAK", "FOCUS"]) {
    const started = await act(auth.token, study.id, "start");
    assert.equal(started.phase, expected);
    advance(started.plannedSeconds);
    await sweepTimers(ctx);
  }
  assert.equal((await myStats(auth.token)).focusedSeconds, 30);
});
void test("leaving, being kicked and cancelling all keep the focus time earned so far", async () => {
  const owner = await user();
  const leaver = await user();
  const kicked = await user();
  const study = await makeSession(owner.token);
  const full = await joinCode(leaver.token, study.code);
  const both = await joinCode(kicked.token, study.code);
  assert.equal(full.members.length + 1, both.members.length);
  await act(owner.token, study.id, "start");
  advance(2);
  await request(
    `/api/sessions/${study.id}/leave`,
    "POST",
    leaver.token,
    undefined,
    204,
  );
  advance(3);
  const target = both.members.find((m) => m.userId === kicked.user.id);
  assert.ok(target);
  await request(
    `/api/sessions/${study.id}/members/${target.id}`,
    "DELETE",
    owner.token,
    undefined,
    204,
  );
  advance(1);
  await act(leaver.token, study.id, "cancel", 403);
  const cancelled = await act(owner.token, study.id, "cancel");
  assert.equal(cancelled.timerStatus, "IDLE");
  assert.equal((await myStats(leaver.token)).focusedSeconds, 2);
  assert.equal((await myStats(kicked.token)).focusedSeconds, 5);
  assert.equal((await myStats(owner.token)).focusedSeconds, 6);
});

void test("when the owner leaves the longest-standing registered member takes over, and an empty session is deleted", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  const visitor = await guest();
  advance(1);
  await joinCode(visitor.token, study.code);
  advance(1);
  await joinCode(friend.token, study.code);
  const ownerOf = async () =>
    (
      await db.sessionMember.findFirst({
        where: { sessionId: study.id, isOwner: true },
      })
    )?.userId;
  const leave = (token: string) =>
    request(`/api/sessions/${study.id}/leave`, "POST", token, undefined, 204);
  // Registered members come before the guest who arrived earlier.
  await leave(owner.token);
  assert.equal(await ownerOf(), friend.user.id);
  await leave(friend.token);
  const left = await db.sessionMember.findFirstOrThrow({
    where: { sessionId: study.id },
  });
  assert.equal(left.isOwner, true);
  assert.equal(left.guestSessionId, visitor.guest.id);
  await leave(visitor.token);
  assert.equal(await db.pomodoroSession.count({ where: { id: study.id } }), 0);
});
void test("only the owner can delete a session, which removes it but keeps study time", async () => {
  const owner = await user();
  const friend = await user();
  const visitor = await guest();
  const study = await makeSession(owner.token);
  const path = `/api/sessions/${study.id}`;
  for (const token of [friend.token, visitor.token])
    await joinCode(token, study.code);
  await act(owner.token, study.id, "start");
  advance(3);
  for (const token of [friend.token, visitor.token])
    await request(path, "DELETE", token, undefined, 403);
  assert.equal(await db.pomodoroSession.count({ where: { id: study.id } }), 1);

  await request(path, "DELETE", owner.token, undefined, 204);
  assert.equal(await db.pomodoroSession.count({ where: { id: study.id } }), 0);
  assert.equal(
    await db.sessionMember.count({ where: { sessionId: study.id } }),
    0,
  );
  await request(path, "GET", owner.token, undefined, 404);
  await joinCode(friend.token, study.code, 404);
  const listed = await request<Session[]>("/api/sessions", "GET", owner.token);
  assert.ok(!listed.some((item) => item.id === study.id));
  // Repeating the request, or deleting an unknown session, is a 404.
  await request(path, "DELETE", owner.token, undefined, 404);

  // The focus time in progress was credited to registered members at deletion.
  assert.equal((await myStats(friend.token)).focusedSeconds, 3);
  assert.equal((await myStats(owner.token)).focusedSeconds, 3);
});
void test("guests can study solo and logout removes their temporary identity and empty session", async () => {
  const visitor = await guest();
  const solo = await makeSession(visitor.token, { solo: true });
  await act(visitor.token, solo.id, "start");
  advance(2);
  await request("/api/auth/logout", "POST", visitor.token, undefined, 204);
  assert.equal(
    await db.guestSession.findUnique({ where: { id: visitor.guest.id } }),
    null,
  );
  // Nobody is left in it, so the session goes too.
  assert.equal(
    await db.pomodoroSession.findUnique({ where: { id: solo.id } }),
    null,
  );
  await request("/api/auth/me", "GET", visitor.token, undefined, 401);
});
void test("minigame results are recorded for registered players only", async () => {
  const winner = await user();
  const loser = await user();
  await recordMatch(ctx, winner.user.id, loser.user.id);
  await recordMatch(ctx, winner.user.id, null);
  await recordMatch(ctx, null, loser.user.id);
  const won = await myStats(winner.token);
  assert.deepEqual([won.wins, won.losses, won.played], [2, 0, 2]);
  const lost = await myStats(loser.token);
  assert.deepEqual([lost.wins, lost.losses, lost.played], [0, 2, 2]);
});
void test("simultaneous shared starts produce exactly one live timer", async () => {
  const auth = await user();
  const study = await makeSession(auth.token);
  const responses = await Promise.all(
    [1, 2].map(async () =>
      fetch(`${base}/api/sessions/${study.id}/timer/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(
    await db.pomodoroSession.count({
      where: { id: study.id, timerStatus: "RUNNING" },
    }),
    1,
  );
});
void test("deleting an account revokes sessions and hands its sessions to the next member", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  await joinCode(friend.token, study.code);
  await act(owner.token, study.id, "start");
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
  const next = await db.sessionMember.findFirstOrThrow({
    where: { sessionId: study.id, isOwner: true },
  });
  assert.equal(next.userId, friend.user.id);
  assert.equal((await myStats(friend.token)).focusedSeconds, 2);
});
void test("a person cannot accrue study time in overlapping timers", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  await joinCode(friend.token, study.code);
  const own = await makeSession(friend.token, { solo: true });
  await act(friend.token, own.id, "start");
  // The friend is busy in a live solo timer, so the shared one can't start.
  await act(owner.token, study.id, "start", 409);
  await act(friend.token, own.id, "cancel");
  await act(owner.token, study.id, "start");
  const another = await makeSession(friend.token, { solo: true });
  await act(friend.token, another.id, "start", 409);
  await request(
    `/api/sessions/${study.id}/leave`,
    "POST",
    friend.token,
    undefined,
    204,
  );
  await act(friend.token, another.id, "start");
  await joinCode(friend.token, study.code, 409);
});
void test("simultaneous solo starts allow only one active timer", async () => {
  const visitor = await guest();
  const first = await makeSession(visitor.token, { solo: true });
  const second = await makeSession(visitor.token, { solo: true });
  const responses = await Promise.all(
    [first, second].map(async (one) =>
      fetch(`${base}/api/sessions/${one.id}/timer/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${visitor.token}` },
      }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
});
void test("joining during a pause does not credit paused time", async () => {
  const owner = await user();
  const friend = await user();
  const study = await makeSession(owner.token);
  await act(owner.token, study.id, "start");
  advance(2);
  await act(owner.token, study.id, "pause");
  advance(30);
  await joinCode(friend.token, study.code);
  advance(30);
  await act(owner.token, study.id, "resume");
  advance(8);
  await sweepTimers(ctx);
  assert.equal((await myStats(friend.token)).focusedSeconds, 8);
  assert.equal((await myStats(owner.token)).focusedSeconds, 10);
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
    (await db.userStat.count({
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

void test("dev auth acts as a user without a token, only when switched on", async () => {
  const account = await user();
  const serve = async (devAuth: boolean) => {
    const server = createApp(ctx, { devAuth }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return { server, base: `http://127.0.0.1:${address.port}` };
  };
  const on = await serve(true);
  const off = await serve(false);
  try {
    const as = { "X-Dev-User": account.user.username };
    assert.equal((await fetch(`${on.base}/api/auth/me`)).status, 401);
    const me = await fetch(`${on.base}/api/auth/me`, { headers: as });
    assert.equal(me.status, 200);
    assert.equal(
      ((await me.json()) as { profile: { id: number } }).profile.id,
      account.user.id,
    );
    const unknown = await fetch(`${on.base}/api/auth/me`, {
      headers: { "X-Dev-User": "nobody-" + prefix },
    });
    assert.equal(unknown.status, 401);
    assert.equal((await fetch(`${on.base}/dev/actors`)).status, 200);
    // Off: the header is ignored and the actor list is hidden.
    assert.equal(
      (await fetch(`${off.base}/api/auth/me`, { headers: as })).status,
      401,
    );
    assert.equal((await fetch(`${off.base}/dev/actors`)).status, 404);
  } finally {
    for (const { server } of [on, off])
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
  }
});

void test("two-factor by email: enable, sign-in code, resend, limits, disable", async () => {
  const account = await user();
  const password = "Correct-password-42";
  const status = () =>
    request<{ enabled: boolean }>("/api/auth/2fa", "GET", account.token);
  const flag = async () =>
    (await db.user.findUniqueOrThrow({ where: { id: account.user.id } }))
      .twoFactorEnabledAt;
  const emailed = () => {
    const mail = mails.at(-1);
    assert.ok(mail);
    assert.equal(mail.to, account.user.email);
    const code = /code is (\d{6})/.exec(mail.text)?.[1];
    assert.ok(code);
    return code;
  };
  const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
  const toggle = (
    action: "enable" | "disable",
    step: "request" | "confirm",
    input: object,
    expected: number,
    token = account.token,
  ) =>
    request(
      `/api/auth/2fa/${action}${step === "request" ? "/request" : ""}`,
      "POST",
      token,
      input,
      expected,
    );
  const challenge = async () => {
    const result = await request<{
      twoFactorRequired: true;
      challengeToken: string;
    }>("/api/auth/login", "POST", undefined, {
      username: account.user.username,
      password,
    });
    assert.equal(result.twoFactorRequired, true);
    assert.ok(!("token" in result));
    return result.challengeToken;
  };
  const second = (challengeToken: string, code: string, expected: number) =>
    request<Auth>(
      "/api/auth/login/2fa",
      "POST",
      undefined,
      { challengeToken, code },
      expected,
    );
  const resend = (challengeToken: string) =>
    request(
      "/api/auth/login/2fa/resend",
      "POST",
      undefined,
      { challengeToken },
      204,
    );

  // Off by default; asking for a code needs the password.
  assert.deepEqual(await status(), { enabled: false });
  await toggle("enable", "request", { password: "wrong-password" }, 401);
  await toggle("disable", "request", { password }, 409);

  // A newer code replaces the older one; only a hash of the code is stored.
  const before = mails.length;
  await toggle("enable", "request", { password }, 204);
  assert.equal(mails.length, before + 1);
  const stale = emailed();
  await toggle("enable", "request", { password }, 204);
  const code = emailed();
  const rows = await db.emailToken.findMany({
    where: {
      userId: account.user.id,
      purpose: "TWO_FACTOR_ENABLE_CODE",
      usedAt: null,
    },
  });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0]?.tokenHash, code);

  // Not on until the code is confirmed: sign-in still gives a session.
  const plain = await request<Auth>("/api/auth/login", "POST", undefined, {
    username: account.user.username,
    password,
  });
  assert.ok(plain.token);
  await toggle("enable", "confirm", { password, code: "12" }, 400);
  await toggle("enable", "confirm", { password, code: wrong(code) }, 400);
  if (stale !== code)
    await toggle("enable", "confirm", { password, code: stale }, 400);
  await toggle("enable", "confirm", { password: "nope", code }, 401);
  await toggle("enable", "confirm", { password, code }, 204);
  assert.deepEqual(await status(), { enabled: true });
  assert.ok(await flag());
  // The code is spent, and it can't be asked for twice.
  await toggle("enable", "confirm", { password, code }, 409);
  await toggle("enable", "request", { password }, 409);

  // Signing in now needs the emailed code.
  const first = await challenge();
  const signIn = emailed();
  await second(first, wrong(signIn), 401);
  const good = await second(first, signIn, 200);
  await request("/api/auth/me", "GET", good.token);
  // The challenge is spent; the token itself is not a code.
  await second(first, signIn, 401);
  await second(await challenge(), first, 401);

  // Resend replaces the code; the old one stops working.
  const again = await challenge();
  const oldCode = emailed();
  await resend(again);
  const newCode = emailed();
  if (oldCode !== newCode) await second(again, oldCode, 401);
  await second(again, newCode, 200);

  // Five wrong codes burn the challenge, and a resend doesn't reset the count.
  const burned = await challenge();
  const burnedCode = emailed();
  for (let i = 0; i < 5; i++) await second(burned, wrong(burnedCode), 401);
  await second(burned, burnedCode, 401);
  const partly = await challenge();
  for (let i = 0; i < 4; i++) await second(partly, "000000", 401);
  await resend(partly);
  await second(partly, "000000", 401);
  await second(partly, emailed(), 401);

  // A sign-in code expires.
  const expiring = await challenge();
  const expiringCode = emailed();
  advance(6 * 60);
  await second(expiring, expiringCode, 401);

  // Turning it off needs the password and an emailed code of its own.
  await toggle("disable", "confirm", { password }, 400, good.token);
  await toggle("disable", "request", { password: "wrong-password" }, 401);
  await toggle("disable", "request", { password }, 204, good.token);
  const off = emailed();
  // A sign-in code can't turn it off, nor a disable code sign you in.
  const forLogin = await challenge();
  const loginCode = emailed();
  await toggle("disable", "confirm", { password, code: loginCode }, 400);
  await second(forLogin, off, 401);
  // Five wrong codes lock that code; a fresh request works.
  for (let i = 0; i < 5; i++)
    await toggle("disable", "confirm", { password, code: wrong(off) }, 400);
  await toggle("disable", "confirm", { password, code: off }, 400);
  await toggle("disable", "request", { password }, 204);
  await toggle("disable", "confirm", { password, code: emailed() }, 204);
  assert.deepEqual(await status(), { enabled: false });
  assert.equal(await flag(), null);
  // Pending sign-ins are cancelled, and sign-in is plain again.
  assert.equal(
    await db.loginChallenge.count({ where: { userId: account.user.id } }),
    0,
  );
  assert.ok(
    (
      await request<Auth>("/api/auth/login", "POST", undefined, {
        username: account.user.username,
        password,
      })
    ).token,
  );

  // Guests have no account to protect.
  const visitor = (await guest()).token;
  await toggle("enable", "request", { password }, 403, visitor);
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

  // Codes expire after 15 minutes.
  await post("request", { email: account.user.email }, 202);
  const stale = lastCode();
  const now = clock;
  clock = new Date(now.getTime() + 16 * 60_000);
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

void test("email verification: an unverified account is emailed a code that proves the address", async () => {
  const account = await user(false);
  await request(
    "/api/auth/verify-email/resend",
    "POST",
    account.token,
    {},
    202,
  );
  const code = codeFor(account.user.email);
  const wrong = wrongCode(code);
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

void test("unverified accounts can only verify, fix their email or leave", async () => {
  const account = await user(false);
  await request("/api/sessions", "GET", account.token, undefined, 403);
  await request("/api/auth/me", "GET", account.token);
  await request("/api/users/me", "GET", account.token);
  await request("/api/auth/logout", "POST", account.token, undefined, 204);
});

void test("moderation: kick and mute are owner powers", async () => {
  const owner = await user();
  const member = await user();
  const other = await user();
  const study = await makeSession(owner.token);
  const path = `/api/sessions/${study.id}`;
  await joinCode(member.token, study.code);
  const full = await joinCode(other.token, study.code);
  const memberId = (r: Session, id: number) =>
    r.members.find((m) => m.userId === id)?.id ?? "";

  // Only the owner moderates; the owner can't be targeted.
  const target = memberId(full, member.user.id);
  await request(
    `${path}/members/${target}/mute`,
    "POST",
    other.token,
    { minutes: 5 },
    403,
  );
  await request(
    `${path}/members/${target}`,
    "DELETE",
    other.token,
    undefined,
    403,
  );
  await request(
    `${path}/members/${memberId(full, owner.user.id)}/mute`,
    "POST",
    owner.token,
    { minutes: 5 },
    409,
  );

  // Muting is stored on the member (the chat server enforces it); unmuting clears it.
  const mutedOf = async () =>
    (await request<Session>(path, "GET", owner.token)).members.find(
      (m) => m.id === target,
    )?.mutedUntil;
  await request(`${path}/members/${target}/mute`, "POST", owner.token, {
    minutes: 5,
  });
  assert.ok(await mutedOf());
  await request(`${path}/members/${target}/mute`, "DELETE", owner.token);
  assert.equal(await mutedOf(), null);

  // A kicked user is removed but can return with the session code.
  await request(
    `${path}/members/${target}`,
    "DELETE",
    owner.token,
    undefined,
    204,
  );
  await request(path, "GET", member.token, undefined, 403);
  await joinCode(member.token, study.code);
});

void test("health reports pending migrations", async () => {
  const name = "99999999999999_not_applied";
  const dir = `prisma/migrations/${name}`;
  mkdirSync(dir);
  try {
    assert.equal((await fetch(`${base}/api/health`)).status, 503);
  } finally {
    rmSync(dir, { recursive: true });
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

void test("guests can't take a registered username", async () => {
  const owner = await user();
  for (const displayName of [
    owner.user.username,
    owner.user.username.toUpperCase(),
  ])
    await request("/api/auth/guest", "POST", undefined, { displayName }, 409);
  await request(
    "/api/auth/guest",
    "POST",
    undefined,
    { displayName: `${owner.user.username}x` },
    201,
  ).then((g) => guestIds.push((g as GuestAuth).guest.id));
});

void test("members say whether they are a guest", async () => {
  const owner = await user();
  const visitor = await guest();
  const study = await makeSession(owner.token);
  await joinCode(visitor.token, study.code);
  const view = await request<Session>(
    `/api/sessions/${study.id}`,
    "GET",
    owner.token,
  );
  assert.deepEqual(
    view.members.map((m) => [m.userId === null, m.isGuest]).sort(),
    [
      [false, false],
      [true, true],
    ],
  );
});

// Smallest files with the right signature; the API checks format, not decoding.
const png = Buffer.concat([
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1"),
  randomBytes(32),
]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), randomBytes(32)]);
async function upload(token: string, type: string, data: Buffer) {
  return fetch(`${base}/api/users/me/avatar`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": type },
    body: new Uint8Array(data),
  });
}

void test("avatars: validated upload, public image, default and removal", async () => {
  const owner = await user();
  const other = await user();
  const unverified = await user(false);
  const visitor = await guest();
  const get = (id: number) => fetch(`${base}/api/users/${String(id)}/avatar`);

  assert.equal((await upload(visitor.token, "image/png", png)).status, 403);
  assert.equal((await upload(unverified.token, "image/png", png)).status, 403);
  assert.equal((await upload(owner.token, "text/plain", png)).status, 415);
  // The label must match the bytes, and SVG (scripts) is never accepted.
  assert.equal((await upload(owner.token, "image/png", jpeg)).status, 400);
  assert.equal((await upload(owner.token, "image/svg+xml", png)).status, 415);
  const big = Buffer.concat([png, Buffer.alloc(513 * 1024)]);
  assert.equal((await upload(owner.token, "image/png", big)).status, 413);

  assert.equal((await upload(owner.token, "image/png", png)).status, 204);
  assert.equal((await upload(owner.token, "image/jpeg", jpeg)).status, 204);
  // Public: no token, readable from another origin, and the latest upload wins.
  const shown = await get(owner.user.id);
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get("content-type"), "image/jpeg");
  assert.equal(
    shown.headers.get("cross-origin-resource-policy"),
    "cross-origin",
  );
  assert.deepEqual(Buffer.from(await shown.arrayBuffer()), jpeg);

  // No picture, or no such user: the same default, revealing nothing.
  for (const id of [other.user.id, 2147483647]) {
    const fallback = await get(id);
    assert.equal(fallback.status, 200);
    assert.match(
      fallback.headers.get("content-type") ?? "",
      /^image\/svg\+xml/,
    );
  }
  await request("/api/users/me/avatar", "DELETE", owner.token, undefined, 204);
  assert.match(
    (await get(owner.user.id)).headers.get("content-type") ?? "",
    /^image\/svg\+xml/,
  );
});

void test("public profile shows safe fields and the friendship with the viewer", async () => {
  const a = await user();
  const b = await user();
  const visitor = await guest();
  interface View {
    id: number;
    username: string;
    email?: string;
    focusedSeconds: number;
    friendship: { status: string; direction: string } | null;
  }
  const view = (token: string, id: number, expected = 200) =>
    request<View>(
      `/api/users/${String(id)}`,
      "GET",
      token,
      undefined,
      expected,
    );

  const seen = await view(a.token, b.user.id);
  assert.equal(seen.username, b.user.username);
  assert.equal(seen.email, undefined);
  assert.equal(seen.focusedSeconds, 0);
  assert.equal(seen.friendship, null);
  await view(visitor.token, b.user.id);
  await view(a.token, 2147483647, 404);
  await request(
    "/api/friends",
    "POST",
    a.token,
    { username: b.user.username },
    201,
  );
  assert.deepEqual(
    (await view(a.token, b.user.id)).friendship?.direction,
    "outgoing",
  );
  assert.deepEqual(
    (await view(b.token, a.user.id)).friendship?.direction,
    "incoming",
  );
  assert.equal((await view(a.token, a.user.id)).friendship, null);
});

void test("admin: list, edit, delete and reset two-factor, never the last admin", async () => {
  const admin = await user();
  const plain = await user();
  const target = await user();
  const visitor = await guest();
  await db.user.update({
    where: { id: admin.user.id },
    data: { role: "ADMIN" },
  });
  const api = (
    path: string,
    method = "GET",
    token = admin.token,
    input?: unknown,
    expected = 200,
  ) =>
    request<Record<string, unknown>>(
      `/api/admin${path}`,
      method,
      token,
      input,
      expected,
    );

  // Only admins get in; the role is visible on their own profile.
  await api("/users", "GET", plain.token, undefined, 403);
  await api("/users", "GET", visitor.token, undefined, 403);
  const profile = await request<{ profile: { role: string } }>(
    "/api/auth/me",
    "GET",
    admin.token,
  );
  assert.equal(profile.profile.role, "ADMIN");

  const found = (await api(
    `/users?q=${target.user.username.toUpperCase()}`,
  )) as unknown as { id: number; email?: string; role: string }[];
  assert.deepEqual(
    found.map((u) => [u.id, u.role]),
    [[target.user.id, "USER"]],
  );
  assert.equal(found[0]?.email, target.user.email);
  assert.equal(
    (await api(`/users/${String(target.user.id)}`)).twoFactorEnabled,
    false,
  );
  await api("/users/2147483647", "GET", admin.token, undefined, 404);

  const owned = await makeSession(target.token);
  // Edit: validation, collisions, and a new email must be verified again.
  const path = `/users/${String(target.user.id)}`;
  await api(path, "PATCH", admin.token, {}, 400);
  await api(path, "PATCH", admin.token, { role: "ROOT" }, 400);
  await api(path, "PATCH", admin.token, { username: plain.user.username }, 409);
  const edited = await api(path, "PATCH", admin.token, {
    email: `new-${target.user.email}`,
    username: `${target.user.username}x`,
  });
  assert.equal(edited.emailVerifiedAt, null);
  assert.equal(edited.username, `${target.user.username}x`);
  assert.equal(mails.at(-1)?.to, `new-${target.user.email}`);

  // Two-factor reset for someone locked out.
  await api(`${path}/2fa`, "DELETE", admin.token, undefined, 404);
  await db.user.update({
    where: { id: target.user.id },
    data: { twoFactorEnabledAt: new Date() },
  });
  await db.loginChallenge.create({
    data: {
      userId: target.user.id,
      tokenHash: "x",
      codeHash: "x",
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  assert.equal((await api(path)).twoFactorEnabled, true);
  await api(`${path}/2fa`, "DELETE", admin.token, undefined, 204);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: target.user.id } }))
      .twoFactorEnabledAt,
    null,
  );
  assert.equal(
    await db.loginChallenge.count({ where: { userId: target.user.id } }),
    0,
  );
  await api(`${path}/2fa`, "DELETE", admin.token, undefined, 404);

  // Delete removes the account and its sessions; not yourself, not twice.
  await api(path, "DELETE", admin.token, undefined, 204);
  assert.equal(await db.user.count({ where: { id: target.user.id } }), 0);
  assert.equal(await db.pomodoroSession.count({ where: { id: owned.id } }), 0);
  await api(path, "DELETE", admin.token, undefined, 404);
  await api(
    `/users/${String(admin.user.id)}`,
    "DELETE",
    admin.token,
    undefined,
    409,
  );

  // The last admin can't step down; with a second admin they can.
  await db.user.updateMany({
    where: { role: "ADMIN", id: { not: admin.user.id } },
    data: { role: "USER" },
  });
  const mine = `/users/${String(admin.user.id)}`;
  await api(mine, "PATCH", admin.token, { role: "USER" }, 409);
  await api(`/users/${String(plain.user.id)}`, "PATCH", admin.token, {
    role: "ADMIN",
  });
  await api(mine, "PATCH", admin.token, { role: "USER" });
  await api("/users", "GET", admin.token, undefined, 403);
  await api("/users", "GET", plain.token);
});

void test("admin creates users and sets passwords; moderators only look", async () => {
  const admin = await user();
  const moderator = await user();
  await db.user.update({
    where: { id: admin.user.id },
    data: { role: "ADMIN" },
  });
  await db.user.update({
    where: { id: moderator.user.id },
    data: { role: "MODERATOR" },
  });
  const name = `${prefix}made${String(++count)}`;
  const fresh = {
    username: name,
    email: `${name}@example.test`,
    password: "Initial-password-42",
  };

  // Creating is admin-only, validated, and the account starts verified.
  await request("/api/admin/users", "POST", moderator.token, fresh, 403);
  await request(
    "/api/admin/users",
    "POST",
    admin.token,
    { ...fresh, password: "short" },
    400,
  );
  await request(
    "/api/admin/users",
    "POST",
    admin.token,
    { ...fresh, role: "BOSS" },
    400,
  );
  const created = await request<{
    id: number;
    role: string;
    emailVerifiedAt: string | null;
  }>(
    "/api/admin/users",
    "POST",
    admin.token,
    { ...fresh, role: "MODERATOR" },
    201,
  );
  assert.equal(created.role, "MODERATOR");
  assert.ok(created.emailVerifiedAt);
  await request("/api/admin/users", "POST", admin.token, fresh, 409);
  const login = (password: string, expected = 200) =>
    request<{ token: string }>(
      "/api/auth/login",
      "POST",
      undefined,
      { username: name, password },
      expected,
    );
  const first = await login(fresh.password);
  await request("/api/sessions", "GET", first.token);

  // A new password replaces the old and signs the user out everywhere.
  await request(
    `/api/admin/users/${String(created.id)}`,
    "PATCH",
    admin.token,
    { password: "Changed-by-admin-42" },
  );
  await request("/api/auth/me", "GET", first.token, undefined, 401);
  await login(fresh.password, 401);
  await login("Changed-by-admin-42");
  await request(
    `/api/admin/users/${String(created.id)}`,
    "PATCH",
    admin.token,
    { password: "short" },
    400,
  );

  // Moderators see the list without private details and can't change anything.
  const list = await request<Record<string, unknown>[]>(
    `/api/admin/users?q=${name}`,
    "GET",
    moderator.token,
  );
  assert.deepEqual(
    list.map((u) => u.username),
    [name],
  );
  assert.equal("email" in (list[0] ?? {}), false);
  assert.equal(list[0]?.role, "MODERATOR");
  const detail = await request<Record<string, unknown>>(
    `/api/admin/users/${String(created.id)}`,
    "GET",
    moderator.token,
  );
  assert.equal("email" in detail, false);
  await request(
    `/api/admin/users/${String(created.id)}`,
    "PATCH",
    moderator.token,
    { role: "USER" },
    403,
  );
  await request(
    `/api/admin/users/${String(created.id)}`,
    "DELETE",
    moderator.token,
    undefined,
    403,
  );
});

void test("moderators moderate sessions they belong to, but not staff or the owner", async () => {
  const owner = await user();
  const moderator = await user();
  const outsider = await user();
  const member = await user();
  const peer = await user();
  const admin = await user();
  await db.user.update({
    where: { id: moderator.user.id },
    data: { role: "MODERATOR" },
  });
  await db.user.update({
    where: { id: peer.user.id },
    data: { role: "MODERATOR" },
  });
  await db.user.update({
    where: { id: admin.user.id },
    data: { role: "ADMIN" },
  });
  const study = await makeSession(owner.token);
  const path = `/api/sessions/${study.id}`;
  for (const who of [moderator, member, peer, admin])
    await joinCode(who.token, study.code);
  const full = await request<Session>(path, "GET", owner.token);
  const memberOf = (id: number) =>
    full.members.find((m) => m.userId === id)?.id ?? "";
  // Not a member: a moderator has no say here, and a plain member neither.
  await request(
    `${path}/members/${memberOf(member.user.id)}/mute`,
    "POST",
    outsider.token,
    { minutes: 5 },
    403,
  );
  await request(
    `${path}/members/${memberOf(member.user.id)}/mute`,
    "POST",
    member.token,
    { minutes: 5 },
    403,
  );
  const stray = await user();
  await db.user.update({
    where: { id: stray.user.id },
    data: { role: "MODERATOR" },
  });
  await request(
    `${path}/members/${memberOf(member.user.id)}`,
    "DELETE",
    stray.token,
    undefined,
    403,
  );

  // As a member, a moderator can mute and kick.
  await request(
    `${path}/members/${memberOf(member.user.id)}/mute`,
    "POST",
    moderator.token,
    { minutes: 5 },
  );

  // Staff and the owner are out of a moderator's reach; an admin member can.
  for (const target of [peer.user.id, admin.user.id, owner.user.id]) {
    await request(
      `${path}/members/${memberOf(target)}/mute`,
      "POST",
      moderator.token,
      { minutes: 5 },
      target === owner.user.id ? 409 : 403,
    );
    await request(
      `${path}/members/${memberOf(target)}`,
      "DELETE",
      moderator.token,
      undefined,
      target === owner.user.id ? 409 : 403,
    );
  }
  await request(
    `${path}/members/${memberOf(peer.user.id)}/mute`,
    "POST",
    admin.token,
    { minutes: 5 },
  );

  await request(
    `${path}/members/${memberOf(member.user.id)}`,
    "DELETE",
    moderator.token,
    undefined,
    204,
  );
});

// --- OAuth ------------------------------------------------------------------
// Drives the browser flow against a fake provider and returns the final redirect.
async function oauth(provider: string, profile: OAuthProfile, state?: string) {
  const code = `code-${randomBytes(6).toString("hex")}`;
  profiles.set(code, profile);
  const start = await fetch(`${base}/api/auth/oauth/${provider}`, {
    redirect: "manual",
  });
  assert.equal(start.status, 302);
  const sent = new URL(start.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const cookie = (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const done = await fetch(
    `${base}/api/auth/oauth/${provider}/callback?code=${code}&state=${state ?? sent ?? ""}`,
    { redirect: "manual", headers: { cookie } },
  );
  assert.equal(done.status, 302);
  return new URL(done.headers.get("location") ?? "");
}
function who(name: string, over: Partial<OAuthProfile> = {}): OAuthProfile {
  const login = `${prefix}${name}`;
  return {
    providerUserId: login,
    email: `${login}@example.test`,
    emailVerified: true,
    login,
    ...over,
  };
}
const exchange = (done: URL, expected = 200) =>
  request<Auth>(
    "/api/auth/oauth/exchange",
    "POST",
    undefined,
    { code: done.searchParams.get("code") },
    expected,
  );

void test("OAuth: providers, state cookie and a first verified sign-in", async () => {
  const listed = await request<{ providers: string[] }>(
    "/api/auth/oauth",
    "GET",
  );
  assert.deepEqual(listed.providers, ["google", "42"]);
  const missing = await fetch(`${base}/api/auth/oauth/github`, {
    redirect: "manual",
  });
  assert.equal(missing.status, 404);
  const start = await fetch(`${base}/api/auth/oauth/google`, {
    redirect: "manual",
  });
  assert.match(start.headers.get("set-cookie") ?? "", /oauth_state=.*HttpOnly/);

  const profile = who("first");
  const done = await oauth("google", profile);
  assert.ok(done.searchParams.get("code"));
  const session = await exchange(done);
  const stored = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { oAuthAccounts: true },
  });
  assert.equal(stored.passwordHash, null);
  assert.ok(stored.emailVerifiedAt);
  assert.equal(stored.oAuthAccounts.length, 1);
  await request("/api/auth/me", "GET", session.token);
  // A one-time code works once.
  await exchange(done, 401);

  // Signing in again finds the same user.
  const again = await exchange(await oauth("google", profile));
  assert.equal(again.user.id, session.user.id);
  assert.equal(
    await db.oAuthAccount.count({ where: { userId: stored.id } }),
    1,
  );
  // No password login, and no way to change the password without one.
  await request(
    "/api/auth/login",
    "POST",
    undefined,
    { username: stored.username, password: "Correct-password-42" },
    401,
  );
  await request(
    "/api/users/me",
    "PATCH",
    session.token,
    { password: "Another-password-42", currentPassword: "Correct-password-42" },
    401,
  );
  // The code expires after a minute.
  const stale = await oauth("google", profile);
  advance(61);
  await exchange(stale, 401);
  // Deleting the user removes its OAuth rows.
  await db.user.delete({ where: { id: stored.id } });
  assert.equal(
    await db.oAuthAccount.count({ where: { userId: stored.id } }),
    0,
  );
  assert.equal(await db.oAuthCode.count({ where: { userId: stored.id } }), 0);
});

void test("OAuth: a wrong state is refused and creates nothing", async () => {
  const profile = who("badstate");
  const done = await oauth("google", profile, "not-the-state");
  assert.equal(done.searchParams.get("error"), "state");
  assert.equal(
    await db.user.count({ where: { email: profile.email ?? "" } }),
    0,
  );
});

void test("OAuth: an email the provider doesn't vouch for creates nothing until the code is entered", async () => {
  const profile = who("fortytwo", { emailVerified: false });
  const done = await oauth("42", profile);
  assert.equal(done.searchParams.get("code"), null);
  const pendingToken = done.searchParams.get("pending");
  assert.ok(pendingToken);
  assert.equal(
    await db.user.count({ where: { email: profile.email ?? "" } }),
    0,
  );
  assert.equal(mails.at(-1)?.to, profile.email);
  const code = codeFor(profile.email ?? "");
  await pendingPost("/verify", { pendingToken, code: wrongCode(code) }, 400);
  const session = await request<Auth>(
    "/api/auth/signup/verify",
    "POST",
    undefined,
    { pendingToken, code },
    201,
  );
  const stored = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { oAuthAccounts: true },
  });
  assert.ok(stored.emailVerifiedAt);
  assert.equal(stored.passwordHash, null);
  assert.equal(stored.oAuthAccounts.length, 1);
  await request("/api/sessions", "GET", session.token);
});

void test("OAuth: links a verified email and refuses unverified ones", async () => {
  // Verified provider email + verified password account: same user.
  const owner = await user();
  const linked = await exchange(
    await oauth("google", who("link", { email: owner.user.email })),
  );
  assert.equal(linked.user.id, owner.user.id);

  // A provider that doesn't vouch never links to an existing email.
  const refused = await oauth(
    "42",
    who("nolink", { email: owner.user.email, emailVerified: false }),
  );
  assert.equal(refused.searchParams.get("error"), "email_taken");

  // An unverified account may hold data: never taken over.
  const legacy = await user(false);
  const kept = await oauth(
    "google",
    who("legacy", { email: legacy.user.email }),
  );
  assert.equal(kept.searchParams.get("error"), "email_taken");
  assert.equal(await db.user.count({ where: { id: legacy.user.id } }), 1);
});

void test("OAuth: a username clash gets a random suffix", async () => {
  const first = await exchange(await oauth("google", who("same")));
  const second = await exchange(
    await oauth(
      "google",
      who("same", {
        providerUserId: `${prefix}other`,
        email: `${prefix}other@example.test`,
      }),
    ),
  );
  assert.notEqual(first.user.id, second.user.id);
  assert.notEqual(first.user.username, second.user.username);
  assert.match(second.user.username, /^[a-z0-9_-]{3,32}$/);
});

void test("42 logins are reserved: password signups can't take one, real 42 sign-ins can", async () => {
  const signupAs = (name: string, expected: number) => signup(name, expected);
  const reserved = `${prefix}real42`;
  await signupAs(reserved, 409);
  await signupAs(reserved, 409);
  // The answer is remembered: 42 was asked once for two attempts.
  assert.equal(lookups.filter((login) => login === reserved).length, 1);
  // A guest can't take the login of a real 42 student either (answer cached).
  await request(
    "/api/auth/guest",
    "POST",
    undefined,
    { displayName: reserved },
    409,
  );
  await signupAs(`${prefix}plain`, 202);
  // A failing lookup must not block signups.
  await signupAs(`${prefix}boom`, 202);

  // Changing a username to a reserved one is refused; keeping your own is fine.
  const other = await user();
  await request(
    "/api/users/me",
    "PATCH",
    other.token,
    { username: reserved },
    409,
  );

  // The real 42 user gets the login; a Google user with the same login doesn't.
  const real = await exchange(
    await oauth("42", who("real42", { login: reserved })),
  );
  assert.equal(real.user.username, reserved);
  await request("/api/users/me", "PATCH", real.token, { username: reserved });
  const google = await exchange(
    await oauth(
      "google",
      who("gg", {
        login: reserved,
        providerUserId: `${prefix}gg`,
        email: `${prefix}gg@example.test`,
      }),
    ),
  );
  assert.notEqual(google.user.username, reserved);
  assert.match(google.user.username, /^[a-z0-9_-]{3,32}$/);
});

void test("a signup creates no user until the emailed code is entered", async () => {
  const name = `${prefix}p1`;
  const email = `${name}@example.test`;
  const { pendingToken, expiresAt } = await signup(name);
  assert.ok(Date.parse(expiresAt) > clock.getTime());
  assert.equal(await db.user.count({ where: { email } }), 0);
  const row = await db.pendingSignup.findUniqueOrThrow({ where: { email } });
  assert.notEqual(row.tokenHash, pendingToken);
  assert.ok(row.passwordHash?.startsWith("scrypt$"));
  const code = codeFor(email);
  // The token and the code are both required, and the code is six digits.
  await pendingPost("/verify", { code }, 400);
  await pendingPost("/verify", { pendingToken, code: "12" }, 400);
  await pendingPost("/verify", { pendingToken: "nope", code }, 400);
  await pendingPost("/verify", { pendingToken, code: wrongCode(code) }, 400);
  const done = await request<Auth>(
    "/api/auth/signup/verify",
    "POST",
    undefined,
    { pendingToken, code },
    201,
  );
  assert.equal(done.user.username, name);
  assert.ok(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
  );
  assert.equal(await db.pendingSignup.count({ where: { email } }), 0);
  await request("/api/sessions", "GET", done.token);
  // The token is spent.
  await pendingPost("/verify", { pendingToken, code }, 400);
  // A taken username or email is refused up front.
  await signup(name, 409, { email: `${name}2@example.test` });
  await signup(`${name}x`, 409, { email });
});

void test("five wrong codes delete the pending signup", async () => {
  const name = `${prefix}p2`;
  const email = `${name}@example.test`;
  const { pendingToken } = await signup(name);
  const code = codeFor(email);
  for (let i = 0; i < 5; i++)
    await pendingPost("/verify", { pendingToken, code: wrongCode(code) }, 400);
  assert.equal(await db.pendingSignup.count({ where: { email } }), 0);
  await pendingPost("/verify", { pendingToken, code }, 400);
  assert.equal(await db.user.count({ where: { email } }), 0);
});

void test("pending signups expire, and expired rows are cleaned up", async () => {
  const name = `${prefix}p3`;
  const email = `${name}@example.test`;
  const { pendingToken } = await signup(name);
  const code = codeFor(email);
  const saved = clock;
  clock = new Date(clock.getTime() + 11 * 60_000);
  try {
    await pendingPost("/verify", { pendingToken, code }, 400);
    await pendingPost("/resend", { pendingToken }, 400);
    await cleanupExpiredSessions(ctx);
  } finally {
    clock = saved;
  }
  assert.equal(await db.pendingSignup.count({ where: { email } }), 0);
});

void test("resending replaces the code and is limited", async () => {
  const name = `${prefix}p4`;
  const email = `${name}@example.test`;
  const { pendingToken } = await signup(name);
  const first = codeFor(email);
  for (let i = 0; i < 3; i++)
    await pendingPost("/resend", { pendingToken }, 202);
  await pendingPost("/resend", { pendingToken }, 429);
  const latest = codeFor(email);
  // Only the newest code works.
  if (latest !== first)
    await pendingPost("/verify", { pendingToken, code: first }, 400);
  await pendingPost("/verify", { pendingToken, code: latest }, 201);
  await pendingPost("/resend", { pendingToken: "nope" }, 400);
});

void test("a pending signup doesn't lock the email's real owner out", async () => {
  const email = `${prefix}owner@example.test`;
  const attempt = (username: string, expected: number) =>
    signup(`${prefix}${username}`, expected, { email });
  const squatter = await attempt("sq1", 202);
  const owner = await attempt("own1", 202);
  const squatterCode = codeFor(email);
  // The squatter's token no longer works; the owner's does.
  await pendingPost(
    "/verify",
    { pendingToken: squatter.pendingToken, code: squatterCode },
    400,
  );
  await pendingPost(
    "/verify",
    { pendingToken: owner.pendingToken, code: squatterCode },
    201,
  );
  // Once verified, the email is taken for good: no more replacing.
  await attempt("sq2", 409);
});

void test("a pending signup can be cancelled", async () => {
  const name = `${prefix}p5`;
  const email = `${name}@example.test`;
  const { pendingToken } = await signup(name);
  const code = codeFor(email);
  await pendingPost("/cancel", { pendingToken }, 204);
  assert.equal(await db.pendingSignup.count({ where: { email } }), 0);
  await pendingPost("/verify", { pendingToken, code }, 400);
  // Cancelling something unknown or twice also succeeds.
  await pendingPost("/cancel", { pendingToken }, 204);
  await pendingPost("/cancel", {}, 400);
});

void test("OAuth: a Google login that is a real 42 login still gets a suffix when the code is entered", async () => {
  const login = `${prefix}real42`;
  const profile = who("gp", {
    login,
    emailVerified: false,
    providerUserId: `${prefix}gp`,
  });
  const done = await oauth("google", profile);
  const pendingToken = done.searchParams.get("pending");
  assert.ok(pendingToken);
  const session = await request<Auth>(
    "/api/auth/signup/verify",
    "POST",
    undefined,
    { pendingToken, code: codeFor(profile.email ?? "") },
    201,
  );
  assert.notEqual(session.user.username, login);
  assert.match(session.user.username, /^[a-z0-9_-]{3,32}$/);
});
