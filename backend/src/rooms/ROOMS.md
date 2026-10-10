# Pomodoro rooms (no sign-in required): a learning plan

## Context

Today the timer (`frontend/src/pages/Timer.tsx`) lives only in one browser tab: `useState` + `setInterval`. The backend (`backend/src/index.ts`) is Express with no realtime and no database. Goal: anyone can **create** a room or **join** one with a code, and everyone in the room sees the same timer, without an account.

You type the code; I explain each step and the reasoning behind it.

## Core ideas to understand first

1. **Why no sign-in is fine.** A room is identified by a short random code (e.g. `K7P2QX`) that works like an unguessable link. Whoever has the code can join. Each visitor gets an anonymous identity: a random `clientId` made in the browser and saved in `localStorage`, plus a display name they type. Nothing here needs passwords or sessions. Trade-off: anyone with the code can join, and a user who clears storage becomes a new person. That is acceptable for this feature.

2. **Why you need realtime.** HTTP is request/response, so the server can't push "the timer started" to other people. A **WebSocket** is a connection that stays open both ways. Recommendation: **Socket.IO**. It has built-in "rooms" (`socket.join(code)`, `io.to(code).emit(...)`), automatic reconnection, and good beginner docs. The plain `ws` library would make you build the rooms yourself, which is a good exercise but slower.

3. **Why the server owns the time.** Your current timer counts ticks, so it drifts, and two browsers would disagree. Instead the server stores `startedAt` (a timestamp) for the room. Every client computes `elapsed = (now - startedAt) / 1000` itself, so a late joiner or a refresh lands on the correct second. Your existing `getMode` / `calculateRemainingTime` / `formatTime` logic stays, and only the source of `elapsed` changes. Each client's clock may differ a bit, so the server also sends its own `serverNow` and the client keeps an offset (`serverNow - Date.now()`).

4. **Where room state lives.** In a `Map<string, Room>` in server memory. It is the simplest option and fine for now. Rooms vanish when the server restarts, and we delete a room when its last person leaves. A database comes later if you need persistence.

## Steps (each is small and testable)

### Step 1: Backend room model (no network yet)

- New `backend/src/rooms/rooms.ts`: type `Room { code, startedAt: number | null, members: Map<socketId, {clientId, name}> }`, a `Map` store, and plain functions: `createRoom()`, `getRoom(code)`, `joinRoom(...)`, `leaveRoom(...)`, `startRoom(code)`.
- Code generator: 6 chars from an alphabet without look-alikes (no `0/O`, `1/I`), retry on collision.
- Learn: separating logic from transport makes it easy to test.

### Step 2: REST for create + existence check

- `POST /api/rooms` returns `{ code }`. `GET /api/rooms/:code` returns 200 or 404, so the join page can say "room not found" before opening a socket.
- Learn: REST for one-off actions, sockets for live updates.

### Step 3: Socket.IO server

- `npm i socket.io` in backend. Wrap Express in `http.createServer(app)` and attach `new Server(httpServer)`, then listen on that server instead of `app.listen`.
- Events: client→server `room:join {code, clientId, name}`, `room:start`; server→client `room:state {startedAt, serverNow, members}` broadcast to everyone in the room on any change. On `disconnect`, remove the member and rebroadcast.
- Learn: the server sends the whole state each time (simple and hard to get out of sync), rather than tiny diffs.

### Step 4: Dev wiring

- `frontend/vite.config.ts`: add `"/socket.io": { target: "http://backend:3000", ws: true }` next to the `/api` proxy. Without `ws: true` the upgrade to WebSocket fails.
- `npm i socket.io-client` in frontend.

### Step 5: Frontend identity + socket hook

- `useClientId()`: reads or creates a `crypto.randomUUID()` in `localStorage`.
- `useRoom(code)` hook: connects in `useEffect`, listens for `room:state`, **cleans up (disconnect) on unmount**. This is the classic effect-cleanup lesson, and StrictMode will run it twice in dev, so you'll see why cleanup matters.

### Step 6: Pages and routes (`App.tsx`)

- `/rooms`: "Create room" button (calls `POST /api/rooms`, then `navigate('/rooms/CODE')`) and a "Join" form (input code, validate with `GET`).
- `/rooms/:code`: uses `useParams`, asks for a name if none is saved, then shows the timer and member list. A shared link works as an invite.
- Add a link from Home.

### Step 7: Refactor Timer to be room-driven

- Extract the display/mode logic from `Timer.tsx` into a component that takes `elapsed` as a prop. The solo `/timer` page can keep using local state. The room page feeds it `elapsed` from `startedAt` + the server offset, recomputed by a `setInterval` that only triggers re-render.
- The "Begin" button emits `room:start`. Decide the rule: anyone can start (simplest), or only the creator.

## Deliberately out of scope (mention as next steps)

Pause/reset, host permissions, persistence in a DB, rate limiting room creation, room expiry timers, and later linking anonymous users to real accounts for ft_transcendence.

## Critical files

- Edit: `backend/src/index.ts`, `frontend/src/App.tsx`, `frontend/src/pages/Timer.tsx`, `frontend/vite.config.ts`, `frontend/src/pages/Home.tsx`
- New: `backend/src/rooms/*`, `frontend/src/pages/Rooms.tsx`, `frontend/src/pages/Room.tsx`, `frontend/src/hooks/useRoom.ts`
- Reuse: timer helpers in `Timer.tsx`, the route-registration pattern in `backend/src/example/users/users.ts`

## Verification

- After Step 2: `curl -X POST localhost:3000/api/rooms` and then `curl localhost:3000/api/rooms/<code>`.
- After Step 3: run a tiny script or the browser console with `socket.io-client` to join and see `room:state`.
- End to end: open the room in two browser windows (one private window so it has a different `clientId`). Press Begin in one. Both timers match, a refresh keeps the correct second, closing one updates the member list, and a bad code shows "not found".
- Before each commit: `make ci` (lint, prettier, build), because CI enforces it.
