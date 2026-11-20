# From a hosted database to a local one

Commit `0892b6f`. The app code did not change: Prisma only needs a
`DATABASE_URL`. We changed **where that URL points**.

## Before and after

|                | Before                          | After                                 |
| -------------- | ------------------------------- | ------------------------------------- |
| Database       | Hosted Prisma Postgres          | `db` container (`postgres:17-alpine`) |
| `DATABASE_URL` | In `backend/.env`, by hand      | Set by `docker-compose.yml`           |
| Credentials    | In the connection string        | Root `.env` (git-ignored)             |
| Data           | In the cloud                    | Docker volume `pgdata`                |
| Sharing data   | Everyone used the same database | `make db-dump` / `make db-load`       |

## The five pieces

1. **`db` service** (`docker-compose.yml`): runs PostgreSQL. No port is
   published, so only the other containers can reach it (host: `db`, port 5432).
   Data lives in the named volume `pgdata`, so it survives `make down` and is
   deleted by `make fclean`. A healthcheck (`pg_isready`) tells Compose when the
   database accepts connections.
2. **Credentials** (`.env.example` → `.env`): `POSTGRES_USER`,
   `POSTGRES_PASSWORD` and `POSTGRES_DB`. `make` copies `.env.example` to `.env`
   on the first run. `.env` is never committed.
3. **Backend wiring**: the backend gets
   `DATABASE_URL=postgresql://USER:PASSWORD@db:5432/DB` from Compose, built
   from the same variables. `prisma7.config.ts` reads it. `backend/.env` no
   longer needs `DATABASE_URL`.
4. **Start order**: the backend has `depends_on: db: service_healthy`, so it
   waits for a ready database. Then its command runs
   `prisma migrate deploy`, which applies any migration the database lacks (on
   an empty database that creates every table), and then starts the API.
5. **Sharing data** (`Makefile`): the old hosted database was shared by
   everyone, a local one is not.
   - `make db-dump` writes `db/dump.sql` (schema and data, via `pg_dump`).
   - `make db-load` replaces the local database with that file (via `psql`).
   - `db/dump.sql` is git-ignored because it holds real accounts. Send it by hand.

## Everyday use

```sh
make            # creates .env if needed, builds, starts db + backend + frontend
make psql       # SQL shell in the database
make studio     # Prisma Studio at http://localhost:5555
make db-dump    # export to db/dump.sql
make db-load    # import db/dump.sql (stops and restarts the backend)
make down       # stop, keep the data
make fclean     # stop and DELETE the data (the pgdata volume)
```

## How the migration itself was done

1. Add the `db` service, volume and healthcheck, and pass `DATABASE_URL` to the
   backend.
2. Add the root `.env.example`, and make `make` create `.env` from it.
3. Make the backend run `prisma migrate deploy` on start, so a fresh database
   builds itself.
4. Copy the data out of the hosted database as a dump and load it with
   `make db-load`.
5. Stop using the hosted database. It is not deleted yet. Delete or rotate its
   credentials.

## Gotchas

- `make fclean` wipes the data. Run `make db-dump` first, or have a dump ready.
- Changing `POSTGRES_PASSWORD` in `.env` after the volume exists has no effect,
  because Postgres only reads it when it first creates the volume. Run
  `make fclean` to apply a new one.
- The backend tests use a separate database (`npm run test:db:up`, port 55432),
  so they never touch your dev data. Stop it afterwards with
  `npm run test:db:down`.

---

# Session model: what changed

One study session is one server people join: it has members and **one shared
timer**. This replaced `StudyRoom`, `RoomMember`, `SessionParticipant` and the
per-phase `PomodoroSession` rows. The code is applied in `backend/src`; this
section is the map.

## Database

| Before                                         | After                                           |
| ---------------------------------------------- | ----------------------------------------------- |
| `StudyRoom` + per-phase `PomodoroSession`      | `PomodoroSession` (server + timer state)        |
| `RoomMember` + `SessionParticipant`            | `SessionMember` (member = in the timer)         |
| `StudyStat`/`GameStat`/`GameResult`/`MiniGame` | `UserStat` (`focusedSeconds`, `wins`, `losses`) |
| `Message`                                      | gone (chat lives in memory, over WebSocket)     |
| `Presence`                                     | gone (online = connected WebSocket)             |

- `PomodoroSession`: `code` (NULL = solo timer, nobody can join), `phase`
  (`FOCUS`/`BREAK`, alternating), `timerStatus` (`IDLE`/`RUNNING`/`PAUSED`),
  `resumedAt`, `elapsedSeconds`, and the only two settings the owner edits:
  `focusSeconds` and `breakSeconds`. The phase length is derived from them, so
  settings change only between phases (409 while a phase is live). There is no
  "closed" state: the owner deletes the session.
- `SessionMember`: a registered user **or** a guest, `isOwner` (one per session),
  `mutedUntil`, and `creditedAt` (focus time is counted from there). Guests can create and join sessions; they keep nothing.
- `UserStat`: lifetime totals of a registered user. Played games = `wins + losses`
  (all games together). Separate from `SessionMember`, so leaving or deleting a
  session never loses study time.
- CHECKs and partial indexes live in the migration SQL
  (`SessionMember_identity_check`, `_progress_check`, `_one_owner_per_session`,
  `PomodoroSession_timer_check`, `UserStat_totals_check`).
- Dropped as unused: long breaks, `closedAt`, `updatedAt`, `plannedSeconds`,
  `phaseFocusedSeconds`, `Friendship.respondedAt` and `User.verifyBy` (pending
  signups replaced it; an unverified account is never taken over by OAuth).
- Migration `20261116120000_session_model`: existing rooms become sessions
  (closed rooms are deleted),
  their live phase becomes the timer state, live solo timers become sessions with
  `code = NULL`, old study time is summed into `UserStat`. Messages, presence and
  game results are dropped (no game ever recorded a result).

## When study time is saved

Focus seconds are credited to the member (and `UserStat`) **as they happen**, so
nothing is lost when someone stops early:

| Event                               | Credited                                                         |
| ----------------------------------- | ---------------------------------------------------------------- |
| Pause / cancel / phase ends         | every member, up to that moment                                  |
| Member leaves or is kicked          | that member, up to that moment                                   |
| Owner closes or deletes the session | every member, up to that moment                                  |
| **Disconnect**                      | the WebSocket close handler must call `leaveSession` (see below) |

Account deletion removes the stats with the account; guests keep nothing.

## For the WebSocket teammate

- **Disconnect = leave.** When a socket closes, call
  `leaveSession(ctx, actor, sessionId)` (`rooms.service.ts`). It credits what the
  member earned, removes the membership and hands the session to the
  longest-standing member (registered first), or deletes it when empty. If you
  want a grace period for reconnects, delay that call.
- **Timer pushes.** State is timestamps (`resumedAt`, `elapsedSeconds`,
  phase length from `focusSeconds`/`breakSeconds`); clients can count down locally. Push after `timerAction`
  (`timers.service.ts`) and after `sweepTimers` settles a phase.
- **Minigame result.** The game server decides the winner and calls
  `recordMatch(ctx, winnerId, loserId)` (`stats.service.ts`); pass `null` for a
  guest. One transaction, no HTTP route.
- **Chat.** Not stored. Check `SessionMember.mutedUntil` before broadcasting.
- **Break only.** Chat and the minigame list are available only while
  `phase === "BREAK"`; during `FOCUS` they are closed. A game cut off when the
  break ends is simply never recorded (`recordMatch` is only called for a
  finished game).
- **Online status.** `GET /friends` returns `presence: { session }` only (the
  friend's open, coded session). Add `online` from your connection map.

## API after the change

| Old                                                       | New                                                    |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `/rooms…`                                                 | `/sessions…` (`POST /sessions/join {code}`)            |
| `/rooms/:id/timers`, `/timers*`                           | `POST /sessions/:id/timer/{start,pause,resume,cancel}` |
| solo `POST /timers`                                       | `POST /sessions {solo: true}`                          |
| `/rooms/:id/messages…`, `/presence`                       | removed (WebSocket)                                    |
| `/rooms/:id/close`                                        | removed (use `DELETE /sessions/:id`)                   |
| `/games`, `/games/:key/results`                           | removed (`recordMatch`)                                |
| `/users/me/analytics`, `/study-sessions`, `/game-results` | removed (the Analytics page must be redone)            |
| `/users/me/stats`                                         | `{ focusedSeconds, wins, losses, played }`             |

## Apply it

`make` (the backend runs `prisma migrate deploy` on start). An old
`db/dump.sql` still loads and migrates on the next backend start.
