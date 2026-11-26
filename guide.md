# WePomodoro: what is left to do

Updated on 2026-11-26: everything you already applied was removed from this guide. The frontend files from the previous version are all in your tree and match the guide; `tsc -b` reports 0 errors and `vite build` succeeds (not run in a browser, no real email or OAuth). Tests are not covered.

## Status at a glance

| Area | State |
|---|---|
| Database (new migration applied), backend source, backend docs, backend tests (55 passing), `MODERATOR` role removed | **Done** |
| Frontend: all files of the no-extra-pages plan, `Tomato` on the home page and as the navbar logo | **Done** |
| Build and finish the merge | **To do** (2.1) |

---

## 1. Contract for your teammates (WebSocket layer, minigames)

Do not implement any of this yourself. This is what your side already provides and what theirs must call.

**Authentication.** The browser has one Bearer token (registered user or guest). The socket must authenticate with the same token: hash it with `tokenHash` from `auth.service.ts` and look it up in `AuthSession` (registered) or `GuestSession` (guest), checking `expiresAt`, exactly like `authenticate()`. Do not invent a second login.

**Rooms.** Created and destroyed by the socket server only, kept in memory, deleted when the last participant leaves. The code is 8 characters from `0-9A-Za-z` and is **case-sensitive** (the frontend already treats it that way). No owner: every participant has the same rights. The room settings are `focusSeconds` and `breakSeconds`. A joiner receives the current phase and remaining time and syncs to it. The frontend calls three functions in `frontend/src/roomClient.ts` (`createRoom`, `joinRoom`, `leaveRoom`); replace their bodies with the socket client and nothing else in the UI changes.

**Study time.** When a registered user leaves a room or the socket closes, measure the seconds they sat through during FOCUS phases and call, once:

```ts
import { addFocusedSeconds } from "./stats/stats.service.js";
await addFocusedSeconds(ctx, userId, seconds); // integer 0..86400, ignored if the account is gone
```

Guests: never credit. A longer session must be split into several calls of at most 86400 seconds.

**Guests.** When a guest's socket closes, delete the guest after a short grace period (a few seconds, so a page reload does not log them out): `await endIdentity(ctx, { userId: null, guestSessionId })` from `api/lifecycle.ts`. After that the minute sweeper stays as a safety net.

**Presence and ejection.** Fill `ctx.realtime` in `src/index.ts` when the socket server starts:

```ts
ctx.realtime = {
  presence: (userId) => ({ online: sockets.has(userId), roomCode: roomOf(userId)?.code ?? null }),
  eject: ({ userId, guestSessionId }) => { /* remove from room, close the socket, send "ejected" first */ },
};
```

`presence` feeds the friends page (online dot, "in a room", Join button). `eject` is called by the admin delete endpoints; the frontend reacts to an "ejected" message by calling `eject()` from `frontend/src/api.ts`, which logs out and shows the "ejected" notification.

**Minigames.** When a game ends: `await recordMatch(ctx, winnerUserId, loserUserId)` (use `null` for a guest). That is the only thing persisted.

---

## 2. Finish the merge and check it

### 2.1 Build and finish the merge

1. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx tsc -b && npm run build`, then `make re`.
2. Check there are no conflict markers: `grep -rn "<<<<<<<" frontend/src` should print nothing.
3. `git add -A frontend backend` and review `git status`; the `AD`, `UD` and `AM` entries mean the merge is still open. Commit when you are happy (`git commit`; say so if you want me to do it).

### 2.2 Check it by hand

**Backend** (`cd backend`): `npx tsc --noEmit && npm run lint && npx prettier --check src`. **Frontend** (`cd frontend`): `npx tsc -b && npm run build`, then `make re`.

1. **Guest.** Open `/` in a private window: the tomato bobs beside the headline. Guest tab, a name, Enter. You land on `/create`; the sidebar has Rooms and Exit. Typing `/friends` or `/profile` sends you back to `/create` (`RegisteredRoute`).
2. **Register.** Sign Up tab: username, email, password. The same card turns into the code form. Enter the 6-digit code (printed in the backend log when SMTP is not set). You land on `/create`. "Cancel" returns to the form.
3. **Log in** with that account: `/create`. The eye icon shows and hides the password.
4. **Forgot password.** Sign In tab, "Forgot password?": email, code, new password, then "Back to sign in" and log in with the new one.
5. **OAuth** needs the provider credentials in the backend `.env` and `FRONTEND_URL` pointing at the Vite URL. The buttons go to the provider and come back to `/auth/oauth`.
6. **Profile.** Change the username, upload an avatar, turn 2FA on and off in the Security card. To test "Confirm your email", change the email through the API (`PATCH /api/users/me` with `currentPassword`); the card appears, ask for the code and confirm it. Statistics show zeros; to see numbers: `INSERT INTO "UserStat" ("userId","focusedSeconds","wins","losses") VALUES (<id>, 7200, 3, 1) ON CONFLICT ("userId") DO UPDATE SET "focusedSeconds"=7200, "wins"=3, "losses"=1;`.
7. **Friends.** Two accounts: add by username from one, accept in the other, remove. Both show offline (no realtime yet).
8. **Admin.** `npm run users:role -- <your-username> admin` in the backend container, log out and in again. `/profile` now ends with the Administration card: connected guests and all users. Delete a guest or user that is logged in in another window: their next request shows the "You have been ejected" notification and its button takes them to `/`.
9. **Room.** Create a room: durations, Create room, copy the code, Start studying: you reach `/room/<code>` with the timer UI and Leave. Joining that code from another browser fails with "Room not found" until the WebSocket layer exists.

**Waiting for teammates, do not expect it to work yet:** a second person joining a room, timer sync, friends going online or showing a room, study time being saved, the live eject of someone inside a room, guests deleted on tab close by disconnect, minigames.

---

## 3. Optional

- Changing the password while logged in has no UI yet. The backend supports it (`PATCH /api/users/me` with `currentPassword` and `password`); it would be one more card in `Profile`.

---

## 4. How the app works, end to end

This is the whole picture once the steps above are applied. Use it to check each step and to brief your teammates.

### 4.1 Who can be in the app

| Identity | How you get it | Stored in | Lives until | Keeps statistics |
|---|---|---|---|---|
| **Guest** | Type a username on the Guest tab | `GuestSession` row; token in the browser's `sessionStorage` | You press Exit, close the tab (teammates' socket disconnect), or the 60 s sweeper finds it expired | No |
| **Registered** | Register (username, email, password + 6-digit email code) or OAuth (Google, GitHub, 42) | `User` row; token in `localStorage` | Until you delete the account or an admin does | Yes (`UserStat`) |
| **Admin** | A registered user whose role is `ADMIN` (`npm run users:role -- <username> admin`) | Same as registered | Same | Yes |

An API request always acts as exactly one of them (`Actor`: `userId` or `guestSessionId`, never both). Every identity authenticates with a Bearer token; only its hash is stored.

### 4.2 Screen map

```
                         /   (Home, three tabs)
        +---------------+---------------+------------------+
        |  Guest        |  Log in       |  Register        |
        |  username     |  user+pass    |  user,email,pass |
        |               |  (2FA code)   |  -> 6-digit code |
        |               |  or OAuth     |  (same tab)      |
        |               |  Forgot pass? |                  |
        |               |  (same tab)   |                  |
        +-------+-------+-------+-------+---------+--------+
                |               |                 |
                +---------------+-----------------+
                                |  all three end here
                                v
                        /create  (room creation)
              +------------------+-------------------+
              | study minutes    |  join with a code |
              | break minutes    |                   |
              | [Create room]    |                   |
              +--------+---------+---------+---------+
                       | code + Copy        |
                       | [Start studying]   |
                       +----------+---------+
                                  v
                          /room/:code  (timer, chat, minigames)
                                  | Leave / close tab
                                  v
                      study time saved (registered only)

 Sidebar:   Guest:      Rooms, Exit
            Registered: Rooms, Friends, Profile, Exit
            Admin:      same; the Administration card is inside Profile

 /profile (one page): account data, confirm email (only if unverified),
                      statistics, security (2FA, delete account),
                      administration (admins only), log out
```

### 4.3 Routes

| Route | Who | What |
|---|---|---|
| `/` | everyone (logged-in people are sent to `/create`) | Guest / Log in / Register tabs |
| `/auth/oauth` | everyone | OAuth return page: exchanges the one-time code for a token, or shows the 6-digit code form for a new account |
| `/create` | guest, registered, admin | Create or join a room |
| `/room/:code` | guest, registered, admin | The room |
| `/friends` | registered, admin (guests bounce to `/create`) | Friends list, requests, add by username, Join their room |
| `/profile` | registered, admin | Username, avatar, confirm email, statistics, 2FA, delete account, and for admins the Administration card |

There are no other pages: the 6-digit code, password recovery and administration are components inside `/`, `/auth/oauth` and `/profile`, and "ejected" is a notification.

### 4.4 Flows

**Guest.** Guest tab, a username, Enter. `POST /api/auth/guest` creates a `GuestSession` and returns a token. You land on `/create`. You can create and join rooms. You have no friends, profile or statistics. Exit calls `POST /api/auth/logout`, which deletes the row. If you just close the tab, the sessionStorage token is gone and the row is deleted by the teammates' disconnect handler, or at the latest by the minute sweeper.

**Register.** Username, email, password. `POST /api/auth/signup` stores a `PendingSignup` and emails a 6-digit code (printed in the backend log without SMTP). The Sign Up card then turns into the code form (`VerifyCodeForm`, no new page); `POST /api/auth/signup/verify` creates the `User` and `UserStat`, and returns a token. Land on `/create`.

**Log in.** `POST /api/auth/login`. With 2FA on, the answer is a challenge: the form asks for the emailed code (`/api/auth/login/2fa`). OAuth goes `/api/auth/oauth/:provider` to the provider, back to the callback, then `/auth/oauth` in the frontend exchanges the code (`POST /api/auth/oauth/exchange`), or, for a new account whose email the provider doesn't vouch for, shows the same code form. **Forgot password** is inside the Sign In tab: "Forgot password?" turns the card into three steps (email, emailed code, new password) using `password-reset/request`, `verify` and `confirm`, then goes back to sign in.

**Room.** Rooms are never stored. Creating one sets study and break minutes and produces a case-sensitive 8-character code to share. There is no owner. Anyone with the code joins and follows the same timer. All of this lives in the teammates' WebSocket layer (in memory). Until it exists, `roomClient.ts` is a tab-local stub, so only the creator can enter.

**Leaving a room.** The realtime layer measures the focus seconds and calls `addFocusedSeconds(ctx, userId, seconds)` for registered users only, then deletes a guest. This runs on Leave and on tab close. It is not an HTTP endpoint, so nobody can credit themselves.

**Friends** (registered only). Add by username (`POST /api/friends`). If the other person already asked you, it is accepted instead. They accept (`POST /api/friends/:id/accept`) or either side removes (`DELETE /api/friends/:id`). `GET /api/friends` returns `friends`, `incoming`, `outgoing`; each accepted friend carries `presence { online, roomCode }`, which comes from `ctx.realtime.presence(userId)` (offline until the teammates plug it in). A friend in a room shows a Join button that goes to `/room/<roomCode>`.

**Profile** (registered only, a single page). Change username, upload or remove an avatar (png, jpeg, webp, 512 KB max), turn 2FA on or off (each with an emailed code), delete the account, see statistics: **studied time, minigame wins, minigame losses** and nothing else. If the email is unverified (after changing it) a "Confirm your email" card asks for a code (`/auth/verify-email/resend`, then `/auth/verify-email`). Admins also get the Administration card.

**Admin.** The Administration card in `/profile` (admins only) lists connected guests (`GET /api/admin/guests`) and all users (`GET /api/admin/users`). Delete a guest (`DELETE /api/admin/guests/:id`) or a user (`DELETE /api/admin/users/:id`). The row is deleted first, so every token dies at once; then `ctx.realtime.eject(identity)` removes the person from their room live. Everyone else gets 403 on these routes.

**Ejected.** When a request answers 401 (token dead) or the realtime layer calls `eject()` from `api.ts`, the identity is forgotten and a notification appears over the current page: "You have been ejected", with a button "Back to the start" that goes to `/`.

### 4.5 Data model (what the database holds)

```
User 1--1 UserStat        focusedSeconds, wins, losses
User 1--1 UserAvatar      image bytes
User 1--* AuthSession     token hashes (one per device)
User 1--* OAuthAccount    Google / GitHub / 42 links
User 1--* EmailToken      verify email, reset password
User 1--* LoginChallenge  2FA codes
User *--* User            Friendship (requester, addressee, status)
GuestSession              displayName, tokenHash, expiresAt   (no link to User)
PendingSignup, OAuthCode  short-lived, swept every minute
```

No room, no timer, no membership, no chat is stored. Deleting a `User` deletes everything above that points at it through the foreign keys.

### 4.6 Who builds what

| Piece | Owner | Contract |
|---|---|---|
| Auth, entry flow, friends, profile, stats, admin, API | You | This guide |
| WebSocket server: rooms, codes, timer, sync, chat | Teammates | Pass `ctx.realtime = { presence, eject }` into `createApp`; call `addFocusedSeconds` on leave; delete guests on disconnect (a few seconds of grace for reloads); replace the three functions in `frontend/src/roomClient.ts` |
| Minigames | Teammates | Call `recordMatch(ctx, winnerId \| null, loserId \| null)` when a match ends; guests pass `null` |

Details of the contract are in section 1.
