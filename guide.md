# WePomodoro: what is left to do

Updated on 2026-11-26: everything you already applied was removed from this guide. The frontend files from the previous version are all in your tree and match the guide; `tsc -b` reports 0 errors and `vite build` succeeds (not run in a browser, no real email or OAuth). Tests are not covered.

## Status at a glance

| Area | State |
|---|---|
| Database (new migration applied), backend source, backend docs, backend tests (55 passing), `MODERATOR` role removed | **Done** |
| Frontend: all files of the no-extra-pages plan, `Tomato` on the home page and as the navbar logo | **Done** |
| Frontend: the last 10 lint errors (6 files, full files given) | **To fix** (1) |
| Check it by hand in a browser | **To do** (3.2) |

---

## 1. Fix the last 10 lint errors

The `--fix` run left 10 errors that need manual edits. Each file below is the full file with the fix applied; only the change described is different. I applied them to a scratch copy: `npx eslint src` then reports 0 problems, `tsc -b` reports 0 errors and `vite build` succeeds. None of this was applied to your tree.

#### `frontend/src/api.ts`

`api.ts` (mine): the request headers are built with `Headers` instead of spreading `init.headers` (which could be an array); one number in a template string is wrapped in `String(...)`.

```ts
import { useAuthStore } from "./authStore";
import { useNoticeStore } from "./store/noticeStore";

// Messages the backend sends when the token itself is no longer valid: the
// session expired, or an admin deleted the account or guest.
const deadToken = /session expired or invalid|valid bearer token/i;

/** Forget the identity and show the "ejected" notice. Also for the realtime layer. */
export function eject() {
  useAuthStore.getState().logout();
  useNoticeStore.getState().showEjected();
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    const message = data?.error ?? `HTTP ${String(res.status)}`;
    if (res.status === 401 && token && deadToken.test(message)) eject();
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T,>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";
```

#### `frontend/src/components/AdminPanel.tsx`

`AdminPanel.tsx` (mine): the lists load inside the effect and a `reload` counter re-fetches them (Refresh button and after a delete); `String(u.id)` in the URL.

```tsx
import { useEffect, useState } from "react";
import { api, errMsg } from "../api";
import { useAuthStore } from "../authStore";

interface AdminUser {
  id: number;
  username: string;
  email?: string;
  role: "USER" | "ADMIN";
}
interface AdminGuest {
  id: string;
  displayName: string;
}

// Administration card inside the profile page; only rendered for admins.
export default function AdminPanel() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [error, setError] = useState("");

  // Bumping `reload` fetches the lists again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const live = { on: true };
    void (async () => {
      try {
        const [u, g] = await Promise.all([
          api<AdminUser[]>("/admin/users?take=100"),
          api<AdminGuest[]>("/admin/guests"),
        ]);
        if (live.on) {
          setUsers(u);
          setGuests(g);
        }
      } catch (err) {
        if (live.on) setError(errMsg(err));
      }
    })();
    return () => {
      live.on = false;
    };
  }, [reload]);

  const remove = async (path: string, name: string) => {
    if (!window.confirm(`Delete ${name}? They are removed from their room right away.`)) return;
    setError("");
    try {
      await api(path, { method: "DELETE" });
      setReload((n) => n + 1);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Administration</h2>
        <button
          className="text-sm text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white cursor-pointer"
          onClick={() => { setReload((n) => n + 1); }}
        >
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Connected guests ({guests.length})</h3>
        <ul className="space-y-2">
          {guests.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 p-3 dark:border-slate-700 dark:text-white"
            >
              <span>{g.displayName}</span>
              <button
                className="text-sm text-red-600 cursor-pointer"
                onClick={() => void remove(`/admin/guests/${g.id}`, g.displayName)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 overflow-x-auto">
        <h3 className="font-semibold text-gray-900 dark:text-white">Registered users ({users.length})</h3>
        <table className="w-full text-left text-sm dark:text-gray-200">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              <th className="py-2">ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-slate-700">
                <td className="py-2">{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.id !== me?.id && (
                    <button
                      className="text-red-600 cursor-pointer"
                      onClick={() => void remove(`/admin/users/${String(u.id)}`, u.username)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

#### `frontend/src/components/TwoFactorAuthForm.tsx`

`TwoFactorAuthForm.tsx` (his): `React.FormEvent` is deprecated, so the handler takes `React.SyntheticEvent`.

```tsx
import { useState } from "react";
import FormWrapper from "./FormWrapper";
import { SubmitButton } from "./SubmitButton";
import { FormHeader } from "./FormHeader";

export default function TwoFactorAuthForm() {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    console.log("Código 2FA enviado:", code);
  };

  return (
    <FormWrapper>
      <section className="flex flex-col items-center justify-center w-full py-4">
        <FormHeader
          title="Two-Factor Authentication"
          subtitle="Enter the 6-digit code from your authenticator app"
        />

        <form
          onSubmit={handleSubmit}
          className="flex flex-col w-full gap-6 mt-6 items-center"
        >
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); }}
            placeholder="123456"
            className="px-4 py-3 border-2 border-black dark:border-slate-700 rounded-2xl font-mono text-center tracking-widest text-2xl focus:outline-none focus:border-red-600 w-full placeholder:font-custom dark:bg-slate-900 dark:text-white"
          />
          <div className="w-full">
            <SubmitButton>Verify Code</SubmitButton>
          </div>
        </form>

        <button
          onClick={() => { console.log("Reenviar código"); }}
          className="mt-6 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
        >
          Didn't receive a code? Resend
        </button>
      </section>
    </FormWrapper>
  );
}
```

#### `frontend/src/pages/Friends.tsx`

`Friends.tsx` (his): same pattern as `AdminPanel`: the list loads inside the effect, and the 10-second timer and every action bump `reload`.

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, post, errMsg } from "../api";

interface Presence {
  online: boolean;
  roomCode: string | null;
}
interface Entry {
  id: string; // friendship id
  user: { id: number; username: string };
  presence?: Presence;
}
interface FriendList {
  friends: Entry[];
  incoming: Entry[];
  outgoing: Entry[];
}

export default function Friends() {
  const navigate = useNavigate();
  const [list, setList] = useState<FriendList>({ friends: [], incoming: [], outgoing: [] });
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  // Bumping `reload` fetches the list again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const live = { on: true };
    void (async () => {
      try {
        const next = await api<FriendList>("/friends");
        if (live.on) setList(next);
      } catch (err) {
        if (live.on) setError(errMsg(err));
      }
    })();
    return () => {
      live.on = false;
    };
  }, [reload]);

  // Refreshes presence every 10 s; the WebSocket layer can push it later.
  useEffect(() => {
    const timer = setInterval(() => { setReload((n) => n + 1); }, 10000);
    return () => { clearInterval(timer); };
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const row = (e: Entry, actions: React.ReactNode) => (
    <li
      key={e.id}
      className="flex items-center justify-between rounded-xl bg-white p-3 shadow border border-gray-100 dark:bg-slate-800 dark:border-slate-700"
    >
      <span className="flex items-center gap-3">
        {e.presence && (
          <span
            className={`h-2.5 w-2.5 rounded-full ${e.presence.online ? "bg-green-500" : "bg-gray-300"}`}
            aria-label={e.presence.online ? "online" : "offline"}
          />
        )}
        <span className="font-semibold text-gray-900 dark:text-white">{e.user.username}</span>
        {e.presence?.roomCode && <span className="text-xs text-gray-500">in a room</span>}
      </span>
      <span className="flex gap-3 text-sm">{actions}</span>
    </li>
  );

  const remove = (e: Entry, label: string) => (
    <button className="text-red-600" onClick={() => void run(() => api(`/friends/${e.id}`, { method: "DELETE" }))}>
      {label}
    </button>
  );

  return (
    <div className="flex-grow p-6 space-y-6 dark:text-white">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Friends</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => post("/friends", { username }));
          setUsername("");
        }}
        className="flex gap-2"
      >
        <input
          value={username}
          onChange={(e) => { setUsername(e.target.value); }}
          placeholder="Add by username"
          className="rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
        />
        <button className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="font-semibold mb-2">Requests for you</h2>
        <ul className="space-y-2">
          {list.incoming.map((e) =>
            row(
              e,
              <>
                <button className="text-green-700" onClick={() => void run(() => post(`/friends/${e.id}/accept`))}>
                  Accept
                </button>
                {remove(e, "Decline")}
              </>,
            ),
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Sent</h2>
        <ul className="space-y-2">{list.outgoing.map((e) => row(e, remove(e, "Cancel")))}</ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Your friends</h2>
        <ul className="space-y-2">
          {list.friends.map((e) =>
            row(
              e,
              <>
                {e.presence?.roomCode && (
                  <button
                    className="font-semibold text-red-600"
                    onClick={() => void navigate(`/room/${e.presence?.roomCode ?? ""}`)}
                  >
                    Join
                  </button>
                )}
                {remove(e, "Remove")}
              </>,
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
```

#### `frontend/src/pages/Profile.tsx`

`Profile.tsx`: the avatar URL wraps `user.id` and `avatarVersion` in `String(...)`.

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useProfileStore } from "../store/profileStore";
import { useAuthStore } from "../authStore";
import { api, post, errMsg } from "../api";
import ActivityBoard from "../components/ActivityBoard";
import SecurityPanel from "./SecurityPanel";
import ConfirmEmailButton from "../components/ConfirmEmailButton";
import AdminPanel from "../components/AdminPanel";

export default function Profile() {
  const navigate = useNavigate();
  const user = useProfileStore((s) => s.user);
  const avatarVersion = useProfileStore((s) => s.avatarVersion);
  const fetchUser = useProfileStore((s) => s.fetchUser);
  const updateUsername = useProfileStore((s) => s.updateUsername);
  const bumpAvatar = useProfileStore((s) => s.bumpAvatar);
  const logout = useAuthStore((s) => s.logout);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const handleSave = async () => {
    if (draftName.trim() === "" || draftName === user?.username) {
      setIsEditing(false);
      return;
    }
    try {
      await updateUsername(draftName.trim());
      setIsEditing(false);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleAvatar = async (file: File) => {
    try {
      await api("/users/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      bumpAvatar();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleLogout = async () => {
    try {
      await post("/auth/logout");
    } finally {
      logout();
      void navigate("/");
    }
  };

  if (!user)
    return (
      <div className="animate-pulse text-gray-500 p-8">Cargando perfil...</div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors">
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 rounded-full bg-gray-100 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 overflow-hidden flex-shrink-0 shadow-inner">
            <img
              src={`/api/users/${String(user.id)}/avatar?v=${String(avatarVersion)}`}
              alt={`Avatar de ${user.username}`}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Información de Perfil
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {user.email}
            </p>
          </div>
        </div>
        <label className="px-5 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm font-semibold rounded-full transition-colors cursor-pointer border border-gray-200 dark:border-slate-700">
          Change Profile Picture
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatar(file);
            }}
          />
        </label>
      </section>

      <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-3 border-b border-gray-100 dark:border-slate-800">
          Datos de la cuenta
        </h2>
        <div className="flex justify-between items-center gap-4">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Nombre de usuario
          </span>
          {isEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => { setDraftName(e.target.value); }}
                className="px-3 py-1 border border-gray-300 rounded-full outline-none focus:border-red-600 dark:bg-slate-900 dark:text-white dark:border-slate-700"
                autoFocus
              />
              <button
                onClick={() => void handleSave()}
                className="px-4 py-1 bg-red-600 text-white font-medium rounded-full hover:bg-red-700 transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button
                onClick={() => { setIsEditing(false); }}
                className="px-4 py-1 bg-gray-200 text-gray-800 font-medium rounded-full hover:bg-gray-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {user.username}
              </span>
              <button
                onClick={() => {
                  setDraftName(user.username);
                  setIsEditing(true);
                }}
                className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors cursor-pointer"
              >
                Editar
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>

      <ConfirmEmailButton
        email={user.email}
        isVerified={Boolean(user.emailVerifiedAt)}
        onVerified={() => void fetchUser()}
      />

      <ActivityBoard />

      <SecurityPanel />

      {user.role === "ADMIN" && <AdminPanel />}

      <button
        onClick={() => void handleLogout()}
        className="px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors cursor-pointer dark:bg-slate-800"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
```

#### `frontend/src/pages/Room.tsx`

`Room.tsx` (his): the two timer keys wrap the durations in `String(...)`.

```tsx
import { useState, useCallback } from "react";
import { motion, AnimatePresence, type Transition } from "motion/react";
import Timer from "../components/Timer";
import Chat from "../components/Chat";
import Games from "../components/Games";
import TimeConfig from "../components/TimeConfig";

interface RoomConfig {
  workDuration: number;
  restDuration: number;
}

export default function Room({ initialConfig }: {initialConfig?: RoomConfig}) {
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(initialConfig ?? null);
  const [isRestTime, setIsRestTime] = useState(false);

  const handleStartRoom = ({ 
    workDuration,
    restDuration
  }: {
    workDuration: number;
    restDuration: number;
  }) => {
    setRoomConfig({ workDuration, restDuration });
  };

  const handleTimerEnd = useCallback(() => {
    setIsRestTime((prev) => !prev);
  }, []);

  const smoothTransition: Transition = {
    type: "spring",
    bounce: 0.1,
    duration: 0.7,
  };

  if (!roomConfig) {
    return (
      <div className="flex w-full items-center justify-center bg-gray-50 dark:bg-slate-950">
        <TimeConfig onStartRoom={handleStartRoom} />
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {isRestTime && (
          <motion.div
            key="panel-create"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={smoothTransition}
            className="flex flex-col w-full h-screen p-6 gap-4 md:flex-row items-center justify-center border"
          >
            <Games />
            <Chat />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        transition={smoothTransition}
        className={`flex rounded-2xl items-center justify-center bg-white z-40 dark:bg-slate-900 ${
          isRestTime
            ? "fixed top-4 left-4 px-4 py-2 text-sm shadow-md border border-gray-100"
            : "fixed inset-12 m-auto w-fit h-fit text-9xl font-custom-timer" // Estado centrado y dimensionado
        }`}
      >
        <Timer
          key={
            isRestTime
              ? `rest-${String(roomConfig.restDuration)}`
              : `work-${String(roomConfig.workDuration)}`
          }
          duration={
            isRestTime ? roomConfig.restDuration : roomConfig.workDuration
          }
          onTimeUp={handleTimerEnd}
        />
      </motion.div>
    </>
  );
}
```

---

## 2. Contract for your teammates (WebSocket layer, minigames)

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

## 3. Build and check it

### 3.1 Build

After replacing the six files in section 1: `cd frontend && npx tsc -b && npm run build && npx eslint src` (the last one should print nothing). Then commit; the merge itself is already finished.

### 3.2 Check it by hand

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

## 4. Optional

- Changing the password while logged in has no UI yet. The backend supports it (`PATCH /api/users/me` with `currentPassword` and `password`); it would be one more card in `Profile`.

---

## 5. How the app works, end to end

This is the whole picture once the steps above are applied. Use it to check each step and to brief your teammates.

### 5.1 Who can be in the app

| Identity | How you get it | Stored in | Lives until | Keeps statistics |
|---|---|---|---|---|
| **Guest** | Type a username on the Guest tab | `GuestSession` row; token in the browser's `sessionStorage` | You press Exit, close the tab (teammates' socket disconnect), or the 60 s sweeper finds it expired | No |
| **Registered** | Register (username, email, password + 6-digit email code) or OAuth (Google, GitHub, 42) | `User` row; token in `localStorage` | Until you delete the account or an admin does | Yes (`UserStat`) |
| **Admin** | A registered user whose role is `ADMIN` (`npm run users:role -- <username> admin`) | Same as registered | Same | Yes |

An API request always acts as exactly one of them (`Actor`: `userId` or `guestSessionId`, never both). Every identity authenticates with a Bearer token; only its hash is stored.

### 5.2 Screen map

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

### 5.3 Routes

| Route | Who | What |
|---|---|---|
| `/` | everyone (logged-in people are sent to `/create`) | Guest / Log in / Register tabs |
| `/auth/oauth` | everyone | OAuth return page: exchanges the one-time code for a token, or shows the 6-digit code form for a new account |
| `/create` | guest, registered, admin | Create or join a room |
| `/room/:code` | guest, registered, admin | The room |
| `/friends` | registered, admin (guests bounce to `/create`) | Friends list, requests, add by username, Join their room |
| `/profile` | registered, admin | Username, avatar, confirm email, statistics, 2FA, delete account, and for admins the Administration card |

There are no other pages: the 6-digit code, password recovery and administration are components inside `/`, `/auth/oauth` and `/profile`, and "ejected" is a notification.

### 5.4 Flows

**Guest.** Guest tab, a username, Enter. `POST /api/auth/guest` creates a `GuestSession` and returns a token. You land on `/create`. You can create and join rooms. You have no friends, profile or statistics. Exit calls `POST /api/auth/logout`, which deletes the row. If you just close the tab, the sessionStorage token is gone and the row is deleted by the teammates' disconnect handler, or at the latest by the minute sweeper.

**Register.** Username, email, password. `POST /api/auth/signup` stores a `PendingSignup` and emails a 6-digit code (printed in the backend log without SMTP). The Sign Up card then turns into the code form (`VerifyCodeForm`, no new page); `POST /api/auth/signup/verify` creates the `User` and `UserStat`, and returns a token. Land on `/create`.

**Log in.** `POST /api/auth/login`. With 2FA on, the answer is a challenge: the form asks for the emailed code (`/api/auth/login/2fa`). OAuth goes `/api/auth/oauth/:provider` to the provider, back to the callback, then `/auth/oauth` in the frontend exchanges the code (`POST /api/auth/oauth/exchange`), or, for a new account whose email the provider doesn't vouch for, shows the same code form. **Forgot password** is inside the Sign In tab: "Forgot password?" turns the card into three steps (email, emailed code, new password) using `password-reset/request`, `verify` and `confirm`, then goes back to sign in.

**Room.** Rooms are never stored. Creating one sets study and break minutes and produces a case-sensitive 8-character code to share. There is no owner. Anyone with the code joins and follows the same timer. All of this lives in the teammates' WebSocket layer (in memory). Until it exists, `roomClient.ts` is a tab-local stub, so only the creator can enter.

**Leaving a room.** The realtime layer measures the focus seconds and calls `addFocusedSeconds(ctx, userId, seconds)` for registered users only, then deletes a guest. This runs on Leave and on tab close. It is not an HTTP endpoint, so nobody can credit themselves.

**Friends** (registered only). Add by username (`POST /api/friends`). If the other person already asked you, it is accepted instead. They accept (`POST /api/friends/:id/accept`) or either side removes (`DELETE /api/friends/:id`). `GET /api/friends` returns `friends`, `incoming`, `outgoing`; each accepted friend carries `presence { online, roomCode }`, which comes from `ctx.realtime.presence(userId)` (offline until the teammates plug it in). A friend in a room shows a Join button that goes to `/room/<roomCode>`.

**Profile** (registered only, a single page). Change username, upload or remove an avatar (png, jpeg, webp, 512 KB max), turn 2FA on or off (each with an emailed code), delete the account, see statistics: **studied time, minigame wins, minigame losses** and nothing else. If the email is unverified (after changing it) a "Confirm your email" card asks for a code (`/auth/verify-email/resend`, then `/auth/verify-email`). Admins also get the Administration card.

**Admin.** The Administration card in `/profile` (admins only) lists connected guests (`GET /api/admin/guests`) and all users (`GET /api/admin/users`). Delete a guest (`DELETE /api/admin/guests/:id`) or a user (`DELETE /api/admin/users/:id`). The row is deleted first, so every token dies at once; then `ctx.realtime.eject(identity)` removes the person from their room live. Everyone else gets 403 on these routes.

**Ejected.** When a request answers 401 (token dead) or the realtime layer calls `eject()` from `api.ts`, the identity is forgotten and a notification appears over the current page: "You have been ejected", with a button "Back to the start" that goes to `/`.

### 5.5 Data model (what the database holds)

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

### 5.6 Who builds what

| Piece | Owner | Contract |
|---|---|---|
| Auth, entry flow, friends, profile, stats, admin, API | You | This guide |
| WebSocket server: rooms, codes, timer, sync, chat | Teammates | Pass `ctx.realtime = { presence, eject }` into `createApp`; call `addFocusedSeconds` on leave; delete guests on disconnect (a few seconds of grace for reloads); replace the three functions in `frontend/src/roomClient.ts` |
| Minigames | Teammates | Call `recordMatch(ctx, winnerId \| null, loserId \| null)` when a match ends; guests pass `null` |

Details of the contract are in section 2.
