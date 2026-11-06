# Backend guide: pending signups (no user row until the code is entered)

Not implemented. Do it in the order below. Everything refers to `backend/`.

## 0. Why, and what changes

Today signup creates a `User` row at once and a 10 minute timer (`verifyBy`)
deletes it if the code never comes. Anyone calling `POST /auth/signup` directly
(no frontend) can hold a username or an email for 10 minutes, again and again, so
the real owner can't sign up. Closing the tab can't be detected reliably (a
reload looks the same), and an attacker never opens the tab anyway.

Fix: **signup and "unverified" OAuth sign-ins create a `PendingSignup` row, not a
`User`.** The `User` (and its session) is created only when the right code is
entered. A fake signup then holds nothing: no username, no email, no session, and
nothing to delete when someone leaves the page.

Decisions (change them if you disagree):

- **One pending row per email.** A new signup or sign-in for the same email
  replaces the old pending row (this is the "real owner replaces a squatter"
  rule, now for free). A verified `User` with that email always wins (409).
- **Usernames are not reserved while pending.** The name is checked when the row
  is created (fast feedback) and again when the code is entered. Whoever proves
  their email first gets it; the other gets `409 That name was just taken; sign
up again`. This is what stops username squatting.
- **No session before verification.** The client gets a `pendingToken` (random,
  only its hash is stored), not a bearer token. The user can leave the page
  freely: they have no access to anything until they verify.
- **42 sign-in gets the same treatment.** 42 never vouches for the email, so the
  callback creates a pending row and the code is emailed. GitHub without a verified
  email and Google without `email_verified` too. Providers that vouch for the
  email (Google verified, GitHub verified) still create the user at once.
- **5 wrong codes delete the pending row** (sign up again). Resend: 3 per 15
  minutes per pending row. Expiry: 10 minutes (`VERIFY_WINDOW_MS`).
- **The unverified-user gate stays** for the one case left: a verified user who
  changes their email through `PATCH /users/me` is unverified again (`emailTokens`).
  That flow is not touched.

## 1. Before you start: commit the current work

The uncommitted changes (frontend `VerifyGate`, "Cancel and go back" button,
`POST /auth/verify-email/cancel` and its test) are replaced by this guide:
commit them first so the history is clear, then see 8 for what to remove.

## 2. Schema (`prisma/schema.prisma`) and migration

```prisma
model PendingSignup {
  id             String    @id @default(uuid())
  // Hash of the random pendingToken the client keeps; the client never sees `id`.
  tokenHash      String    @unique
  email          String    @unique
  username       String
  // Password signup: the hash. OAuth: null.
  passwordHash   String?
  // OAuth only: the provider identity to link when the code is entered.
  provider       OAuthProvider?   // use the enum your OAuthAccount already uses
  providerUserId String?
  // Hash of the six-digit code (salted with `id`, like `codeHash` in verify.service.ts).
  codeHash       String
  failedAttempts Int       @default(0)
  resends        Int       @default(0)
  resendWindowAt DateTime
  createdAt      DateTime  @default(now())
  expiresAt      DateTime

  @@index([expiresAt])
}
```

- Check the enum name in the schema (`dbValue: "GOOGLE" | "GITHUB" | "FORTY_TWO"`
  in `oauth.providers.ts`) and reuse it.
- Add a `CHECK` in the migration SQL that `passwordHash IS NOT NULL` or
  `(provider IS NOT NULL AND providerUserId IS NOT NULL)`; look at how earlier
  migrations add constraints by hand (`prisma/migrations/*`).
- `npx prisma migrate dev --name pending_signup` (needs your dev DB), commit the
  generated folder. Update `backend.md` section 4 (data model) with the table.

## 3. A new `src/auth/pending.service.ts`

One file with four functions. Reuse `token()` / `tokenHash()` from `auth.service.ts`
(export `token` if it isn't) and the code hashing/`timingSafeEqual` pattern from
`verify.service.ts`.

1. `createPending(ctx, input)`: `input` is `{ email, username, passwordHash }` or
   `{ email, username, provider, providerUserId }`.
   - Refuse with 409 if a `User` has that email (password signup) or that username
     (`assertNotFortyTwoLogin` stays in the callers, see 4 and 5).
   - In one transaction: `deleteMany({ where: { email } })` then `create`, so a new
     attempt replaces the old one. Generate the pendingToken and a six-digit code
     (`randomInt`), store only hashes, set `expiresAt = now + VERIFY_WINDOW_MS`.
   - Send the same email as `sendVerificationCode` does today (move the text here;
     a mail failure is logged and does not fail the call).
   - Return `{ pendingToken, expiresAt }`.
2. `resendPending(ctx, pendingToken)`: find by `tokenHash`; 404 if missing or
   expired; enforce 3 resends per 15 minutes with `resends` / `resendWindowAt`;
   replace `codeHash`, extend nothing (the 10 minute total stays).
3. `cancelPending(ctx, pendingToken)`: `deleteMany({ where: { tokenHash } })`,
   always 204 (idempotent, reveals nothing).
4. `completePending(ctx, pendingToken, code)`: the only place a `User` is created.
   In one `transaction`:
   - find the row, 400 `Invalid or expired code; request a new one` if missing or
     expired;
   - wrong code: increment `failedAttempts` (commit it, then fail like
     `verifyEmail` does with `return false`); at 5, delete the row;
   - right code: re-check that no `User` has the email (409 `That email is already
registered`) or username (409 `That name was just taken; sign up again`),
     then create the user with `emailVerifiedAt: now`, `verifyBy: null`, the
     password hash, and `oAuthAccounts: { create: {...} }` for OAuth rows. Delete
     the pending row in the same transaction.
   - For OAuth rows a username clash should not fail: reuse the retry loop that
     `oauthCallback` has (random suffix on `P2002`). Move `candidate()` out of
     `oauth.service.ts` (or export it) so this file can use it.
   - Then create the `AuthSession` exactly as `signup` does today and return
     `{ token, expiresAt, user }` (same shape as the old signup response).

## 4. Routes (`src/api/router.ts`)

All public, no bearer token:

| Method | Path                        | Body                            | Result                                |
| ------ | --------------------------- | ------------------------------- | ------------------------------------- |
| POST   | `/auth/signup`              | `{ email, username, password }` | **202** `{ pendingToken, expiresAt }` |
| POST   | `/auth/verify-email`        | `{ pendingToken, code }`        | 201 `{ token, expiresAt, user }`      |
| POST   | `/auth/verify-email/resend` | `{ pendingToken }`              | 202                                   |
| POST   | `/auth/verify-email/cancel` | `{ pendingToken }`              | 204                                   |

- `/auth/signup` keeps its validation, `assertNotFortyTwoLogin`, and the hashing,
  then calls `createPending`. It also refuses (409) a username already held by a
  `User`, so the user finds out now and not after typing the code.
- Today `POST /auth/verify-email` and `/resend` take a bearer token and use the
  unverified-user gate. The **email-change flow still needs those** (an unverified
  _user_ with a token). Make both routes accept either: if the body has
  `pendingToken`, use the pending path; otherwise keep the current behaviour. Do
  not remove `"POST /auth/verify-email"` / `".../resend"` from `unverifiedOk`.
  Remove `"POST /auth/verify-email/cancel"` from `unverifiedOk` and replace its
  handler (it used the bearer token and `verifyBy`).
- Rate limit the new public routes: reuse the signup limiter for `/auth/signup`;
  `/auth/verify-email` and `/resend` per IP **and** per `pendingToken` (the same
  `rateLimit` + `keyGenerator` pattern as `perUser` above them in the file). The
  5-attempt cap on the row is the real brute-force defence (6 digits, 5 tries).
- `createUser` / `POST /users` (if it also signs up with a password) must call the
  same path; grep `signup(` for every caller.

## 5. OAuth (`src/auth/oauth.service.ts`)

- `resolveUser`: keep the linked-identity and the "verified email links to an
  existing verified account" branches. Replace the end of the function:
  - provider vouches (`profile.emailVerified`): create the user at once, as now;
  - otherwise: **do not create a user**. Check `User` for the email (existing
    behaviour: `email_taken` if present) and the username is not required here
    (it is checked at completion), then return `{ pending: {...} }`.
  - Delete the "unverified with `verifyBy`, delete the existing user" branch: new
    pending users don't exist as `User` rows. (Legacy rows with `verifyBy` can
    still be there for a few minutes after the deploy; they expire through the
    sweep in 7. Keep the `email_taken` line for an unverified user without a
    deadline.)
- `oauthCallback` returns either `{ code }` (a user exists) or `{ pendingToken }`.
  For the pending case call `createPending` with `provider` and `providerUserId`
  and the `skipPlain` logic is no longer needed here: the username is picked at
  completion (a Google/GitHub login that is a real 42 login still gets the suffix:
  call `isFortyTwoLogin` in `completePending` for OAuth rows from non-42 providers).
- The callback route redirects to `FRONTEND_URL/auth/oauth?pending=<token>`
  (`encodeURIComponent`) in the pending case, `?code=` otherwise. Update the
  docs sentence that lists the redirect.
- `sendVerificationCode` is no longer called from OAuth (only the email-change
  flow still uses it, in `users`/`auth.service.ts`: grep it).

## 6. `auth.service.ts` and `verify.service.ts`

- `signup`: drop the `tx.user.deleteMany` squatter replacement (7.2 of the old
  guide) and the `verifyBy` field; it now only validates and calls `createPending`.
  Keep `VERIFY_WINDOW_MS` (used by the pending `expiresAt`).
- `verify.service.ts`: keep `sendVerificationCode` and `verifyEmail` for the
  email-change flow, unchanged. The 10 minute text stays.
- `createGuest` and `updateProfile` need no change: a pending username is not
  reserved, and only `User` rows are checked.

## 7. Cleanup (`src/api/lifecycle.ts`)

In `cleanupExpiredSessions`, next to the other expired-row deletes:

```ts
await ctx.db.pendingSignup.deleteMany({
  where: { expiresAt: { lte: ctx.now() } },
});
```

Leave the existing `user.deleteMany({ verifyBy: { lte } })`: it drains legacy
rows after the deploy. When the DB is emptied before the evaluation, a later
migration can drop `User.verifyBy`; not needed now.

## 8. Frontend (hand this to your teammates, or do it after the backend)

- Signup page: `POST /auth/signup` now answers 202 `{ pendingToken }`. Store it in
  **`sessionStorage`** (not `localStorage`, and no `token`), then go to the verify
  page. Do not store a bearer token here.
- Verify page: send `{ pendingToken, code }` to `/auth/verify-email`; on 201
  store `token` in `localStorage` and go to the app. "Send me a new code" calls
  `/resend`; "Cancel and go back" calls `/cancel`, clears `pendingToken`, goes
  to signup. If there is no `pendingToken`, show "start your signup again" with a
  link instead of the form.
- OAuth callback page: `?pending=<token>` means store it in `sessionStorage` and
  go to the verify page (the same page); `?code=` works as today.
- `VerifyGate.tsx` stays, but it now only ever catches users who changed their
  email. Those have a bearer token and no `pendingToken`: the verify page must
  keep the old code path for them, and **hide "Cancel and go back"** for them
  (it only deletes a pending signup). Give them a "Sign out" button instead
  (`POST /auth/logout`), or they can't leave. Remove the old cancel endpoint test
  from `api.test.ts` (it is replaced by the tests below).

## 9. Tests (`test/api.test.ts`)

The helper `user(false)` signs up and expects 201 with a token, which no longer
exists. Change it: sign up, read the code from the captured `mails`, call
`/auth/verify-email` with `{ pendingToken, code }`, and for `verified = false`
then set `emailVerifiedAt: null` with `db.user.update` (that is the "changed my
email" state the gate still handles). Then fix the tests that use it or the old
flow (find them with `grep -n "user(false)\|verify-email\|verifyBy" test/api.test.ts`):

- "email verification: signup emails a code that proves the address": rewrite
  around `pendingToken`: signup returns 202 and **no `User` row exists** (`db.user.count`
  is 0), wrong codes fail, 5 wrong codes delete the pending row, the right code
  returns 201 with a token that works on `/auth/me`.
- "unverified accounts can only verify, fix their email or leave": keep it, built
  on `user(false)` (email-change state); drop what is about signup tokens.
- "signups that never verify are deleted, freeing the email": rewrite: advance the
  clock past 10 minutes, `cleanupExpiredSessions`, the `PendingSignup` row is gone
  and the code is refused with 400.
- "a pending signup doesn't lock the email's real owner out": the second signup
  for the same email replaces the first; the first `pendingToken` and code stop
  working (400), the second completes.
- New: a pending signup holds no username: signup A and B with the same username
  and different emails both get 202; A completes (201), B completes and gets 409.
- New: a pending signup never blocks a verified user's email (409 at signup).
- Replace the "cancel" test I added: `/cancel` with a `pendingToken` deletes the
  row (204) and the same call again is also 204.
- OAuth tests: "an email the provider doesn't vouch for must be verified with a
  code" and the squatter / legacy ones (`api.test.ts` around the `OAuth:` titles):
  42 now redirects with `?pending=`, no user exists yet, completing with the
  emailed code creates the user with the 42 account linked and the plain login as
  username; a 42 pending then a username taken meanwhile gets a suffix.
- 42 reserved logins test: still valid for signup; add that a Google user with a
  real 42 login gets a suffix at completion.

## 10. Docs (`docs/backend.md`)

- "Email verification": rewrite the signup part (pending row, `pendingToken`, no
  user until the code, 5 attempts, resends, 10 minute expiry) and keep the
  email-change part.
- "Sign in with OAuth": the unverified-email branch now ends in
  `?pending=<token>` and the verify call, not an unverified user; update the
  "which user the sign-in resolves to" bullets and the redirect sentence.
- API table (section 3.1): the four routes in 4 above, and that `/auth/signup`
  now answers 202.
- Data model (section 4): `PendingSignup`. Section 7 (lifecycle): its cleanup.
- Section 9 coverage: pending signups, username not held while pending.
- Source map: `src/auth/pending.service.ts`.

## 11. Checks, then try it by hand

`npm run lint`, `npm run format:check`, `npm run test:types`, `npm run test:db:up`,
`npm test`, `npm run test:db:down`. In the frontend: `npx tsc --noEmit`,
`npx eslint src`, `npx prettier --check src`.

By hand (backend and frontend running):

1. Sign up with a fake email: you land on the verify page; in the database there
   is a `PendingSignup` row and **no** `User` row. Open `/me`: you are not signed in.
2. Close the tab: nothing to clean up; the row disappears after 10 minutes.
3. Sign up with the same username and a different email: allowed; whoever enters
   their code first keeps the name.
4. Sign up with someone else's email, then as the real owner with the same email:
   the second replaces the first.
5. "Continue with 42": you are sent to the verify page, the code is emailed, and
   the user is created only when you enter it.

## 12. Still open from before (not part of this change)

- The real 42 API has never been called from the code: run the curl probe
  (token URL, `200` / `404`, rate-limit headers) before the evaluation.
- Repeated 42 sign-in problems: sign in, log out, sign in again, and note the
  exact error and backend log.
- Fail open for the 42 login check, and admin-created users not being checked.
- Optional, not planned: a 42 sign-in renaming whoever holds its plain login,
  redirecting `@student.` emails to "Continue with 42", guest to account upgrade.
