# Prompt to continue the session

Paste everything below the line into a new Claude Code session opened in the
repository root.

---

We are continuing work on WePomodoro (branch `feature/user-management`, main branch
`main`). Read `README.md`, `backend/docs/backend.md`, `docs/local-database.md` and
`git log -8` first, then check `git status`. Here is where we left off.

## Working rules

- Ask me before every `git commit`. Never push: pushing needs my GitHub
  credentials, which you don't have, so tell me to run `! git push` myself.
- When I ask for a big change, explain what it does and what will change first, and
  wait for my go-ahead before touching anything.
- No secrets in the repo: `.env` files are git-ignored, only `.env.example` files are
  committed. Never put my email or personal data into commits or external requests.
- If you start the test database (`npm run test:db:up`), stop it again when the tests
  are done (`npm run test:db:down`): a leftover container blocks `make fclean`.

## What is committed (last commit `f538a77`, not pushed)

Pending signups with an emailed code, 42 logins reserved, rooms joined with one
shared code, PostgreSQL in a local Docker container (`make db-dump`, `db-load`,
`psql`, `studio`), the backend running `prisma migrate deploy` on start.

## What is done but NOT committed (all of it is in the working tree)

I redesigned the database around one **session model** and you applied all the code.
Nothing was committed, pushed or applied to my dev database.

### Database (`backend/prisma/schema.prisma`, migration `20261116120000_session_model`)

- **`PomodoroSession`** replaces `StudyRoom` and the old per-phase `PomodoroSession`.
  It is a server with one shared timer: `name`, `code` (NULL = solo timer, nobody can
  join), `focusSeconds`, `breakSeconds` (the only settings the owner edits),
  `phase` (`FOCUS`/`BREAK`, alternating), `timerStatus` (`IDLE`/`RUNNING`/`PAUSED`),
  `resumedAt`, `elapsedSeconds`, `createdAt`. The phase length is derived from the
  settings, so settings only change while the timer is `IDLE` (409 otherwise).
- **`SessionMember`** replaces `RoomMember` and `SessionParticipant`: a registered
  user or a guest, `isOwner` (exactly one per session), `mutedUntil`, `joinedAt`,
  `creditedAt`. Membership means being in the timer. A member who leaves or is
  kicked is deleted and needs the code to return.
- **`UserStat(userId, focusedSeconds, wins, losses)`** replaces `StudyStat`,
  `GameStat`, `GameResult` and `MiniGame`. Games played = wins + losses, all games
  together. No draws. Guests keep no stats.
- **Dropped:** `Message` (chat will live in memory over WebSocket), `Presence`
  (online = connected socket), `MiniGame`, `closedAt`, `updatedAt` on the session,
  `plannedSeconds`, `phaseFocusedSeconds`, long breaks (`LONG_BREAK`,
  `longBreakSeconds`, `cyclesBeforeLongBreak`, `focusRoundsSinceLongBreak`),
  `Friendship.respondedAt`, `User.verifyBy`.
- `PendingSignup` stays on purpose: it has no foreign key because those people have
  no `User` row yet.
- The migration also deletes closed rooms, messages, presence rows, and unverified
  `User` rows that still had a `verifyBy` deadline.

### Backend code (`backend/src`)

- `timers/timers.service.ts` (timer + crediting), `rooms/rooms.service.ts`
  (sessions, members, `leaveSession`, `transferOwner`, `deleteSession`, kick/mute),
  `stats/stats.service.ts` (`getUserStatistics`, `recordMatch`), friends/lifecycle/
  router/dev updated. `chat/` and `games/` are deleted.
- Routes: `/sessions` (list, create `{name, focusSeconds?, breakSeconds?, solo?}`),
  `POST /sessions/join {code}`, `GET/PATCH/DELETE /sessions/:id`, `/leave`, `/code`,
  `/owner {memberId}`, `/members/:id` (kick), `/members/:id/mute`, and
  `POST /sessions/:id/timer/{start,pause,resume,cancel}`. Removed: `/rooms*`,
  `/timers*`, chat, `/presence`, `/games*`, `/close`, analytics, study-sessions.
  `GET /users/me/stats` returns `{ focusedSeconds, wins, losses, played }`.
  `GET /friends` shows `presence: { session }` only (no `online`).
- Study time is credited on pause, phase end, cancel, leave, kick and delete.
  Owner handover (`keepOwner`): longest-standing member, registered users first; an
  empty session is deleted. Guests can create and join sessions.
- `transaction()` in `api/common.ts` now also retries Postgres serialization
  failures (40001) raised by raw `FOR UPDATE` queries.
- The session view's members have `isMe`.

### Tests and docs

- 84 tests pass (`npm test` in `backend`); `tsc`, `tsc -p test/tsconfig.json`,
  `eslint` and `prettier` were clean; `prisma migrate diff` showed no drift.
- `backend/docs/backend.md` and `docs/local-database.md` describe the new model.
  The latter also has a section for the WebSocket teammate.

### Frontend (`frontend/src`)

- `pages/Analytics.tsx` rewritten for `/users/me/stats`.
- New `pages/Sessions.tsx` (list, join by code, create incl. solo) and
  `pages/Session.tsx` (countdown, owner timer controls, settings, members: make
  owner / remove, new code, leave, delete), `time.ts`, nav link and routes in
  `App.tsx`, CSS in `index.css`. It polls every 3 s. `npx tsc -b`, `eslint` and
  `vite build` are clean. It has not been opened in a browser.

## What is open

1. **Apply the migration to my dev database.** Back up first (`make db-dump`), then
   `docker compose restart backend` (the container runs `prisma migrate deploy`).
   Check the log, `make psql` + `\dt`, and restart `make studio`. Then click through
   `/sessions` in the browser (create, join with a code as a guest, start/pause,
   settings, kick, leave, delete) and fix whatever breaks.
2. **Commit.** Ask me first, in logical commits (migration + schema, backend code,
   tests, docs, frontend). Never push; tell me to run `! git push`. `docs/` and
   this `PROMPT.md` are untracked.
3. **WebSocket layer (my teammate):** call `leaveSession` when a socket closes (this
   saves the study time), push timer changes after `timerAction`/`sweepTimers`,
   allow chat and the minigame list only while `phase === "BREAK"`, call
   `recordMatch(ctx, winnerId, loserId)` after each finished game (`null` for a
   guest), and never record a game cut off by the end of the break. Chat is not
   stored. Details are in `docs/local-database.md`.
4. **Frontend left for later:** chat and minigame panels (break only), mute UI, a
   friends list showing each friend's session, and replacing the polling with
   WebSocket events.
5. **Earlier leftovers (unchanged):**
   - Browser check of signup with a real inbox and of a 42 sign-in with an
     unverified email.
   - The real 42 API has never been called: run a curl probe (token URL, 200 / 404,
     rate-limit headers) before the evaluation. Repeated 42 sign-in problems need
     the exact error and backend log. The 42 login check fails open and
     admin-created users aren't checked.
   - Delete or rotate the old hosted Prisma Postgres database.
   - `make studio` stops on Ctrl+C (only tested through `docker kill`); otherwise
     `docker rm -f studio`.
   - The README still has TODO placeholders (overview, team, database choice,
     schema diagram).
6. **More changes are coming:** I'll describe the next one.

Start by confirming the state (`git status`, `git log`, `make` running, tests green;
stop the test database afterwards), then wait for my next instruction.
