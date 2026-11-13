# Backend guide: pending signups (no user row until the code is entered)

Not implemented yet, except the `PendingSignup` model and its migration (applied).
Everything refers to `backend/` unless it says frontend. Do the steps in order.

Differences from the first plan, because they make the code smaller:

- The pending flow has its **own public routes** (`/auth/signup/verify`,
  `/resend`, `/cancel`). The old authenticated `/auth/verify-email*` routes stay
  exactly as they are for the one case left (a verified user who changed their
  email), so no route has two modes.
- `signup` moves out of `auth.service.ts` into the new `pending.service.ts`, so
  the two files don't import each other.
- The migration also has a `CHECK` (a pending row is a password signup or a
  provider sign-in) and `id` is a native `UUID`, like `OAuthCode`.

## 3. `src/auth/pending.service.ts` (new file)

First, in `auth.service.ts`: `export` the `token()` function (line ~59: change
`function token()` to `export function token()`), and **delete the `signup`
function** (it moves here). Keep `VERIFY_WINDOW_MS`, `SESSION_EXPIRES_AT`,
`hashPassword`, `tokenHash`; the `assertNotFortyTwoLogin` import stays (guests
and `updateProfile` use it).

```ts
import {
  createHash,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  ApiError,
  profileSelect,
  transaction,
  type Context,
  type Transaction,
} from "../api/common.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  SESSION_EXPIRES_AT,
  VERIFY_WINDOW_MS,
  hashPassword,
  token,
  tokenHash,
} from "./auth.service.js";
import { assertNotFortyTwoLogin, isFortyTwoLogin } from "./reserved.service.js";

const MAX_CODE_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_WINDOW_MS = 15 * 60_000;

const invalidCode = () =>
  new ApiError(400, "Invalid or expired code; request a new one");
const gone = () =>
  new ApiError(404, "This signup has expired; please sign up again");

type Provider = "GOOGLE" | "GITHUB" | "FORTY_TWO";
type Identity =
  { passwordHash: string } | { provider: Provider; providerUserId: string };

function codeHash(id: string, code: string) {
  return createHash("sha256").update(`pending:${id}:${code}`).digest("hex");
}

// Builds a valid username from the provider's login; after a clash it adds a
// random suffix. (Moved here from oauth.service.ts, which now imports it.)
export function candidate(login: string, attempt: number) {
  const name = login
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 32)
    .padEnd(3, "_");
  return attempt === 0
    ? name
    : `${name.slice(0, 27)}_${randomInt(0, 65536).toString(16).padStart(4, "0")}`;
}

async function mailCode(ctx: Context, to: string, code: string) {
  try {
    await ctx.mailer.send(
      to,
      "Verify your WePomodoro email",
      `Your verification code is ${code}. It expires in 10 minutes.\n` +
        "If you didn't create an account, you can ignore this email.",
    );
  } catch (error) {
    // A mail failure must not reveal whether the address exists.
    console.error("Could not send verification email", error);
  }
}

// Password signup: validates nothing the route hasn't, refuses a real 42 login,
// then stores the signup. No user exists until `completePending`.
export async function startSignup(
  ctx: Context,
  input: { email: string; username: string; password: string },
) {
  await assertNotFortyTwoLogin(ctx, input.username);
  return createPending(ctx, {
    email: input.email,
    username: input.username,
    passwordHash: await hashPassword(input.password),
  });
}

// Stores (or replaces, per email) a signup and emails the code. For provider
// sign-ins `username` is the provider's login; the real name is picked when the
// code is entered.
export async function createPending(
  ctx: Context,
  input: { email: string; username: string } & Identity,
) {
  const id = randomUUID();
  const bearer = token();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + VERIFY_WINDOW_MS);
  await transaction(ctx, async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } }))
      throw new ApiError(409, "That email is already registered");
    // Password signups find out about a taken name now, not after the code.
    if (
      "passwordHash" in input &&
      (await tx.user.findUnique({ where: { username: input.username } }))
    )
      throw new ApiError(409, "That username is taken");
    // One pending signup per email: a new attempt replaces the old one, so a
    // squatter never blocks the address's real owner.
    await tx.pendingSignup.deleteMany({ where: { email: input.email } });
    await tx.pendingSignup.create({
      data: {
        id,
        tokenHash: tokenHash(bearer),
        email: input.email,
        username: input.username,
        passwordHash: "passwordHash" in input ? input.passwordHash : null,
        provider: "provider" in input ? input.provider : null,
        providerUserId: "provider" in input ? input.providerUserId : null,
        codeHash: codeHash(id, code),
        resendWindowAt: now,
        expiresAt,
      },
    });
  });
  await mailCode(ctx, input.email, code);
  return { pendingToken: bearer, expiresAt };
}

export async function resendPending(ctx: Context, pendingToken: string) {
  const now = ctx.now();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const to = await transaction(ctx, async (tx) => {
    const row = await tx.pendingSignup.findUnique({
      where: { tokenHash: tokenHash(pendingToken) },
    });
    if (!row || row.expiresAt <= now) throw gone();
    const fresh =
      now.getTime() - row.resendWindowAt.getTime() > RESEND_WINDOW_MS;
    if (!fresh && row.resends >= MAX_RESENDS)
      throw new ApiError(429, "Too many codes requested; try again later");
    await tx.pendingSignup.update({
      where: { id: row.id },
      data: {
        codeHash: codeHash(row.id, code),
        failedAttempts: 0,
        resends: fresh ? 1 : row.resends + 1,
        resendWindowAt: fresh ? now : row.resendWindowAt,
      },
    });
    return row.email;
  });
  await mailCode(ctx, to, code);
}

// Always succeeds, so it reveals nothing about whether the token was valid.
export async function cancelPending(ctx: Context, pendingToken: string) {
  await ctx.db.pendingSignup.deleteMany({
    where: { tokenHash: tokenHash(pendingToken) },
  });
}

// The only place a user is created from a signup. A right code makes the user
// and its session in one transaction and removes the pending row.
export async function completePending(
  ctx: Context,
  pendingToken: string,
  code: string,
) {
  const hash = tokenHash(pendingToken);
  const peek = await ctx.db.pendingSignup.findUnique({
    where: { tokenHash: hash },
  });
  if (!peek) throw invalidCode();
  // Google and GitHub users can't take a name that is a real 42 login.
  const skipPlain =
    peek.provider !== null &&
    peek.provider !== "FORTY_TWO" &&
    (await isFortyTwoLogin(ctx, candidate(peek.username, 0)));
  for (let attempt = 0; ; attempt++) {
    try {
      const done = await transaction(ctx, (tx) =>
        finish(ctx, tx, hash, code, attempt + (skipPlain ? 1 : 0)),
      );
      if (!done) throw invalidCode(); // wrong code: the counter was committed
      return done;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // A provider login clash gets a new random suffix; a password signup
        // lost the race for its name or email.
        if (peek.provider && attempt < 4) continue;
        throw new ApiError(409, "That name was just taken; sign up again");
      }
      throw error;
    }
  }
}

async function finish(
  ctx: Context,
  tx: Transaction,
  hash: string,
  code: string,
  attempt: number,
) {
  const now = ctx.now();
  const row = await tx.pendingSignup.findUnique({ where: { tokenHash: hash } });
  if (!row || row.expiresAt <= now) throw invalidCode();
  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(codeHash(row.id, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    if (row.failedAttempts + 1 >= MAX_CODE_ATTEMPTS)
      await tx.pendingSignup.delete({ where: { id: row.id } });
    else
      await tx.pendingSignup.update({
        where: { id: row.id },
        data: { failedAttempts: { increment: 1 } },
      });
    return null;
  }
  const username = row.provider
    ? candidate(row.username, attempt)
    : row.username;
  if (await tx.user.findUnique({ where: { email: row.email } }))
    throw new ApiError(409, "That email is already registered");
  if (!row.provider && (await tx.user.findUnique({ where: { username } })))
    throw new ApiError(409, "That name was just taken; sign up again");
  const user = await tx.user.create({
    data: {
      email: row.email,
      username,
      passwordHash: row.passwordHash,
      emailVerifiedAt: now,
      ...(row.provider &&
        row.providerUserId && {
          oAuthAccounts: {
            create: {
              provider: row.provider,
              providerUserId: row.providerUserId,
            },
          },
        }),
    },
    select: profileSelect,
  });
  await tx.pendingSignup.delete({ where: { id: row.id } });
  const bearer = token();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_AT);
  await tx.authSession.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(bearer),
      createdAt: now,
      expiresAt,
    },
  });
  return { token: bearer, expiresAt, user };
}
```

Notes on the code:

- A wrong code returns `null` (instead of throwing) so the counter update
  commits; `completePending` throws `invalidCode()` after the transaction, like
  `verifyEmail` does. The fifth wrong code deletes the row.
- `ApiError(409)` thrown inside `finish` rolls back, so the pending row stays;
  the user can cancel or sign up again.
- If `candidate` here and the one in `oauth.service.ts` ever differ, the 42
  reservation breaks: delete the old one there (see 5) and import this one.

## 4. Routes (`src/api/router.ts`)

Imports: replace `signup` (from `auth.service.js`) by nothing, and add

```ts
import {
  cancelPending,
  completePending,
  resendPending,
  startSignup,
} from "../auth/pending.service.js";
```

Replace the signup route (line ~276) and add the three public routes right after
it (they must stay **above** the `router.use(async (req, res, next) => { ... authenticate` middleware, because they have no bearer token). `/auth/signup`
is already in the `perIp` list, which covers `/auth/signup/*` too.

```ts
// Each code check or resend is limited per pending signup, on top of the
// per-IP limit and the 5-attempt cap stored on the row.
const perPending = rateLimit({
  windowMs: 15 * 60_000,
  limit: limits.resetRequests,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: bodyKey("pendingToken", "pending", 128),
  handler: tooMany("Too many attempts; try again later"),
});
const pendingToken = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 128)
    throw new ApiError(400, "A pendingToken is required");
  return value;
};

router.post(["/auth/signup", "/users"], async (req, res) => {
  const input = body(req);
  res.status(202).json(
    await startSignup(ctx, {
      email: email(input.email),
      username: username(input.username),
      password: password(input.password),
    }),
  );
});

router.post("/auth/signup/verify", perPending, async (req, res) => {
  const input = body(req);
  if (typeof input.code !== "string" || !/^\d{6}$/.test(input.code))
    throw new ApiError(400, "The code must be 6 digits");
  res
    .status(201)
    .json(
      await completePending(ctx, pendingToken(input.pendingToken), input.code),
    );
});

router.post("/auth/signup/resend", perPending, async (req, res) => {
  await resendPending(ctx, pendingToken(body(req).pendingToken));
  res.status(202).json({ message: "A new code has been sent." });
});

router.post("/auth/signup/cancel", async (req, res) => {
  await cancelPending(ctx, pendingToken(body(req).pendingToken));
  res.sendStatus(204);
});
```

Then remove what the pending flow replaces:

- the old `router.post("/auth/verify-email/cancel", ...)` handler and its entry
  `"POST /auth/verify-email/cancel"` in `unverifiedOk` (added in the last commit);
- the `sendVerificationCode(ctx, created.user.id)` call that was in the old signup
  route (gone with the replacement above). `sendVerificationCode` stays imported:
  `/auth/verify-email/resend` and the email change in `PATCH /users/me` use it.

`src/dev.ts` line ~13: the "Sign up" preset now answers 202 with a `pendingToken`
and the console no longer gets a session from it. Add presets for the verify call
(`/auth/signup/verify`, body `{ pendingToken: "{pendingToken}", code: "123456" }`)
if you use the console; check how it fills `{oauthCode}` and do the same for
`{pendingToken}`.

## 5. OAuth (`src/auth/oauth.service.ts`)

1. Delete the local `candidate` function and add
   `import { candidate, createPending } from "./pending.service.js";`. Also delete
   the imports that become unused (`sendVerificationCode`, `VERIFY_WINDOW_MS`).
2. `resolveUser` returns one of three things. Replace everything from
   `const existing = ...` to the end of the function:

```ts
const existing = await tx.user.findUnique({ where: { email: mail } });
if (existing) {
  if (!profile.emailVerified) throw new OAuthError("email_taken");
  if (existing.emailVerifiedAt) {
    const other = await tx.oAuthAccount.findUnique({
      where: {
        userId_provider: { userId: existing.id, provider: found.dbValue },
      },
    });
    if (other) throw new OAuthError("email_taken");
    await tx.oAuthAccount.create({
      data: { userId: existing.id, ...account },
    });
    return { userId: existing.id };
  }
  // Unverified without a deadline is an older account that may hold data.
  // (Older pending users with a deadline are replaced until they expire.)
  if (!existing.verifyBy) throw new OAuthError("email_taken");
  await tx.user.delete({ where: { id: existing.id } });
}
// The provider doesn't vouch for the email: no user yet, the emailed code decides.
if (!profile.emailVerified) return { pending: true as const };
const created = await tx.user.create({
  data: {
    email: mail,
    username: candidate(profile.login, attempt),
    emailVerifiedAt: ctx.now(),
    oAuthAccounts: { create: account },
  },
});
return { userId: created.id };
```

and change the first `return` in the function to `return { userId: linked.userId };`.

3. In `oauthCallback`, replace the part from `const skipPlain` to the `oneTime`
   code creation with:

```ts
// Verified Google and GitHub users can't take a name that is a real 42 login.
const skipPlain =
  found.id !== "42" &&
  (await isFortyTwoLogin(ctx, candidate(profile.login, 0)));
const result = await (async () => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transaction(ctx, (tx) =>
        resolveUser(
          ctx,
          tx,
          found,
          profile,
          mail,
          attempt + (skipPlain ? 1 : 0),
        ),
      );
    } catch (error) {
      if (
        attempt < 4 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
  }
})();
if ("pending" in result) {
  // Google and GitHub logins that are real 42 logins get their suffix when
  // the code is entered (completePending).
  const { pendingToken } = await createPending(ctx, {
    email: mail,
    username: profile.login,
    provider: found.dbValue,
    providerUserId: profile.providerUserId,
  });
  return { pendingToken };
}
const oneTime = randomBytes(32).toString("base64url");
const now = ctx.now();
await ctx.db.oAuthCode.create({
  data: {
    userId: result.userId,
    codeHash: tokenHash(oneTime),
    createdAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  },
});
return { code: oneTime };
```

4. The callback route (`router.ts`, line ~373) now gets `{ code }` or
   `{ pendingToken }`:

```ts
const result = await oauthCallback(
  ctx,
  req.params.provider,
  req.query.code,
  cookieState,
  req.query.state,
);
res.redirect(
  "pendingToken" in result
    ? `${frontend}/auth/oauth?pending=${encodeURIComponent(result.pendingToken)}`
    : `${frontend}/auth/oauth?code=${encodeURIComponent(result.code)}`,
);
```

`oauthExchange` is unchanged. Its docs sentence about `emailVerifiedAt` is now
only true for verified providers.

## 6. `verify.service.ts` and the rest of `auth.service.ts`

Nothing to change in `verify.service.ts`: `sendVerificationCode` and `verifyEmail`
keep serving the email-change flow. `createGuest` and `updateProfile` need no
change (a pending username is not reserved; only `User` rows are checked).

## 7. Cleanup (`src/api/lifecycle.ts`)

In `cleanupExpiredSessions`, after the `emailToken` delete:

```ts
await ctx.db.pendingSignup.deleteMany({
  where: { expiresAt: { lte: ctx.now() } },
});
```

Leave the existing `user.deleteMany({ ... verifyBy ... })`: it drains the older
rows after the deploy. `User.verifyBy` can be dropped by a later migration.

## 8. Frontend

**`pages/SignUp.tsx`**: the response is now 202 `{ pendingToken }`.

```ts
const { pendingToken } = (await res.json()) as { pendingToken: string };
// No session yet: the verify page needs this to check the emailed code.
sessionStorage.setItem("pendingToken", pendingToken);
void navigate("/auth/verify-email");
```

(replace the `localStorage.setItem("token", token)` lines).

**`pages/OAuthCallback.tsx`**: handle `?pending=` before the `code` logic.

```ts
  const pendingToken = params.get("pending");
  ...
  useEffect(() => {
    if (pendingToken) {
      sessionStorage.setItem("pendingToken", pendingToken);
      void navigate("/auth/verify-email", { replace: true });
      return;
    }
    if (!code || started.current) return;
    ...
  }, [code, pendingToken, navigate]);
```

and make the initial error state ignore it: `reason ? ... : code || pendingToken ? "" : "No sign-in code."`.

**`pages/VerifyEmail.tsx`**: two modes, picked by what is stored. A pending signup
uses the new public routes and ends with a token; a signed-in unverified user
(email change) keeps the old routes.

```tsx
const [pendingToken] = useState(() => sessionStorage.getItem("pendingToken"));
const [token] = useState(() => localStorage.getItem("token"));
const active = pendingToken ?? token;

async function call(path: string, body: object) {
  const res = await fetch(
    `${API_URL}/api/auth/${pendingToken ? "signup" : "verify-email"}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken ? "" : (token ?? "")}`,
      },
      body: JSON.stringify(pendingToken ? { ...body, pendingToken } : body),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${String(res.status)})`);
  }
  return res;
}

async function handleSubmit(e: React.SubmitEvent) {
  e.preventDefault();
  await run(async () => {
    const res = await call(pendingToken ? "/verify" : "", {
      code: code.trim(),
    });
    if (pendingToken) {
      const done = (await res.json()) as { token: string };
      sessionStorage.removeItem("pendingToken");
      localStorage.setItem("token", done.token);
    }
    void navigate("/UserInfo");
  });
}

// Pending signup: drop it. Signed-in unverified user: just sign out.
async function cancel() {
  await run(async () => {
    if (pendingToken) {
      await call("/cancel", {});
      sessionStorage.removeItem("pendingToken");
    } else {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      localStorage.removeItem("token");
    }
    void navigate(pendingToken ? "/auth/signup" : "/auth/login");
  });
}
```

In the JSX use `!active` instead of `!token` for the "start again" message (change
its text to "Your signup has expired. Sign up again" with a link to
`/auth/signup` when there is no `pendingToken` and no `token`), and label the
cancel button `{pendingToken ? "Cancel and go back" : "Sign out"}`. The resend
call keeps working: `call("/resend", {})` hits `/auth/signup/resend` for pending
signups and `/auth/verify-email/resend` otherwise.

**`VerifyGate.tsx`**: no change. Pending signups have no token, so it passes them
through; it only locks signed-in users who are unverified.

## 9. Still open from before (not part of this change)

- The real 42 API has never been called from the code: run the curl probe (token
  URL, `200` / `404`, rate-limit headers) before the evaluation.
- Repeated 42 sign-in problems: sign in, log out, sign in again, and note the exact
  error and backend log.
- Fail open for the 42 login check, and admin-created users not being checked.
- Optional, not planned: a 42 sign-in renaming whoever holds its plain login,
  redirecting `@student.` emails to "Continue with 42", guest to account upgrade.

## 10. Progress so far and where we left off

Snapshot of the working tree on `feature/user-management`, to resume from.

**Already done (earlier commits)**

- Reserving 42 logins, the 10 minute signup window and pending-signup
  replacement (backend); unverified accounts blocked in the frontend, cancel for
  pending signups (frontend + `/auth/verify-email/cancel`).

**Backend: done in the working tree, not committed** (`tsc` and `eslint` pass)

- `PendingSignup` model and migration `20261106120000_pending_signup`
  (confirm it is applied to the dev DB).
- Step 3: `pending.service.ts`; `token()` exported and the old `signup` deleted
  from `auth.service.ts`.
- Step 4: `router.ts` has the new signup route (202 + `pendingToken`), the public
  `/auth/signup/{verify,resend,cancel}` routes with `perPending`, and the old
  `/auth/verify-email/cancel` route and its `unverifiedOk` entry are gone.
  `dev.ts` has a "Verify signup code" preset and fills `{pendingToken}`.
- Step 5: `oauth.service.ts` uses the shared `candidate`; `resolveUser` returns
  `{ userId }` or `{ pending: true }`; the callback redirects to
  `/auth/oauth?pending=...` for providers that don't vouch for the email.
- Step 7: `lifecycle.ts` deletes expired `pendingSignup` rows.

**Backend tests: done** (94 pass, `tsc`, `eslint` clean; test DB from
`compose.test.yml`, `npm run test:db:up`)

- The `user()` helper in `test/api.test.ts` now signs up, reads the emailed code
  from the fake mailer and verifies. `user(false)` turns that account into an
  older unverified one (verified cleared, `verifyBy` set) for the tests that need
  one.
- New tests: no user until the code, wrong/missing token or code, five wrong
  codes delete the row, expiry and cleanup, resend limit and replacement, a second
  signup for the same email replaces the first, cancel, a provider that doesn't
  vouch for the email, and a Google login that is a real 42 login getting a
  suffix.

**Backend: still to do**

1. Confirm the migration is applied to the dev DB (`npm run db:migrate`).
2. Later: drop `User.verifyBy` once old rows have drained (the `resolveUser` and
   lifecycle code that read it, and `user(false)` in the tests, go with it).

**Frontend: done** (step 8; `tsc -b` and `eslint` clean): `SignUp.tsx` stores the
`pendingToken` in `sessionStorage`, `OAuthCallback.tsx` handles `?pending=`,
`VerifyEmail.tsx` uses the public routes for a pending signup and the old ones
for a signed-in unverified user.

**Checked against the running stack** (docker compose backend on :3000 with the
migration applied): signup answers 202, a wrong code 400, resend 202, cancel 204,
and the cancelled token is dead. Not done: the full browser run, because the real
code goes to a real mailbox.

**Section 9 leftovers:** real 42 API probe, repeated 42 sign-in errors, fail
open for the 42 login check, admin-created users.

**Left off at:** backend, tests and frontend are done. Next action: click through
signup in the browser with a real inbox (and a 42 / unverified-email sign-in), then
the section 9 leftovers.

## 11. Rooms: shared room code (separate change)

Replaced personal invites, bans and join requests by one shared `StudyRoom.code`
(migration `20261113120000_room_code`, applied to the test DB only: run
`npm run db:migrate` / `db:deploy` on the dev DB). `POST /rooms/join { roomCode }`,
owner-only `POST /rooms/:id/code` to replace it, kick stays, `RoomMember.invitedById`
is gone. Backend, tests (94 pass) and `docs/backend.md` are updated; the frontend
has no room screens yet.
