# WePomodoro: what is left to do

Checked against your working tree on 2026-11-25. Nothing here was applied for you. Tests are not covered.

## Status at a glance

| Area | State |
|---|---|
| Database (schema, migration, live DB) | **Done** |
| Backend source (`src/`) | **Done.** `tsc`, `eslint` and `prettier --check` are all clean. The dev/devAuth code is gone from `src/`, `.env.example` and `.env`. |
| Backend docs (`backend/docs/backend.md`) | **To update** (dev console text, section 1) |
| Frontend: most of the files already match the guide | **Done** (api, stores, icons, forms, Timer, Chat, Games, Profile, Home, layouts, ...) |
| Frontend: files to **delete** | 0 (the About page is already deleted; remove its link, see U4) |
| Frontend: files to **move** | 1 (`Room.tsx` -> `RoomPage.tsx`) |
| Frontend: files to **create** | 13 |
| Frontend: files to **update** | 5 (`Room.tsx`, `CreateRoom.tsx`, `Navbar.tsx`, `App.tsx`, `AdminRoute.tsx`) plus 1 optional cosmetic |

`npx tsc -p tsconfig.app.json --noEmit` in `frontend/` currently fails only because of the old `CreateRoom.tsx` (unused variables) and `pages/Room.tsx` (it holds the wrong file's code and imports the missing `roomClient`). Everything below fixes those.

---

## 1. Backend: only the docs are left

Source code is finished. In `backend/docs/backend.md` remove the dev console (you deleted it):

| Line | Remove |
|---|---|
| 53-67 | Two paragraphs: "In development (`NODE_ENV` not `production`) the API also serves a test console at `http://localhost:3000/dev` ... `(/auth/oauth?code=...)` ... to get a token." and "To skip tokens in the console, set `DEV_AUTH=true` ... lets any caller act as anyone." |
| ~1001 | The table row `src/dev.ts  Dev-only test console at /dev (not mounted in production)` |

Optional: the same file still documents sessions, timers and `/api/sessions` (about 47 mentions). They no longer exist; delete those sections when you have time, or when the realtime layer lands.

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

`presence` feeds the friends page (online dot, "in a room", Join button). `eject` is called by the admin delete endpoints; the frontend reacts to an "ejected" message by calling `eject()` from `frontend/src/api.ts`, which logs out and opens `/ejected`.

**Minigames.** When a game ends: `await recordMatch(ctx, winnerUserId, loserUserId)` (use `null` for a guest). That is the only thing persisted.
---

## 3. Frontend: what is left

Verified against a clean scratch copy: with all of the below applied, `tsc` has 0 errors and `vite build` succeeds.

### Already done (do nothing)

`api.ts`, `authStore.ts`, `sessionStore.ts`, `index.css`, `main.tsx`, `ActivityBoard`, `Chat`, `ForgotPasswordForm`, `FormHeader`, `FormWrapper`, `GameView`, `Games`, `GamesMenu`, `GuestForm`, `Icons`, `InputField`, `Logo`, `OAuthSubmitButton`, `Profilebar`, `RoomButton`, `SignupForm`, `SingleFieldForm`, `SubmitButton`, `TimeConfig`, `TimeInputControl`, `Timer`, `Tomato`, `TwoFactorAuthForm`, `ProtectedLayout`, `PublicLayout`, `Home`, `NotFound`, `Profile`, `SignUp`, `profileStore`, `EntryPanel` (it imports `./SigninForm`, which is right: your `SigninForm.tsx` already holds the new sign-in form, so no rename is needed), `NightSwitch` and `Navbar` (only blank lines / a commented line differ, see optional below).

### Move (1)

The About page is gone (you deleted it): nothing to restore.

- **R1. Move your `pages/Room.tsx` to `pages/RoomPage.tsx`.** You pasted the room-loading page (`RoomPage`) into `Room.tsx`, but `Room.tsx` must stay the timer UI (R2). Do: `mv frontend/src/pages/Room.tsx frontend/src/pages/RoomPage.tsx`. The content is already exactly the guide's version, so this is the whole step.

### Update (5 + 1 optional)

Do R1 first, then:

### R2. `frontend/src/pages/Room.tsx`

his timer, rest-room chat and games. Now accepts `initialConfig` so the durations chosen on `/create` are not asked again.

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

export default function Room({ initialConfig }: { initialConfig?: RoomConfig }) {
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(initialConfig ?? null);
  const [isRestTime, setIsRestTime] = useState(false);

  const handleStartRoom = ({
    workDuration,
    restDuration,
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
              ? `rest-${roomConfig.restDuration}`
              : `work-${roomConfig.workDuration}`
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

### R2b. `frontend/src/components/AdminRoute.tsx` (replace)

The only change: a non-admin goes to `/create` (the landing page for everyone logged in) instead of `/`.

```tsx
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../authStore";

export const AdminRoute = () => {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" ? <Outlet /> : <Navigate to="/create" replace />;
};
```

Optional cosmetic: in `NightSwitch.tsx` delete the commented line `//   const toggleDarkMode = ...` (line 17).

### U3. `frontend/src/components/CreateRoom.tsx` (replace the whole file)

The room creation component keeps its name `CreateRoom` (it only creates and joins rooms). Replace the whole file with the code below. Do not create a `CreatePanel.tsx`.

Durations, create, share the code, start, or join by code.

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { FormHeader } from "./FormHeader";
import FormWrapper from "./FormWrapper";
import { SubmitButton } from "./SubmitButton";
import TimeInputControl from "./TimeInputControl";
import { createRoom, joinRoom, type RoomHandle } from "../roomClient";
import { errMsg } from "../api";

export default function CreateRoom() {
  const navigate = useNavigate();
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [created, setCreated] = useState<RoomHandle | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const create = () =>
    run(async () => {
      setCreated(
        await createRoom({
          focusSeconds: focusMinutes * 60,
          breakSeconds: breakMinutes * 60,
        }),
      );
    });

  const join = () =>
    run(async () => {
      const room = await joinRoom(code.trim());
      void navigate(`/room/${room.code}`);
    });

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.code);
    setCopied(true);
  };

  if (created)
    return (
      <FormWrapper>
        <FormHeader title="Room ready" subtitle="Share the code or start studying" />
        <p className="my-6 select-all text-center font-mono text-4xl tracking-widest text-gray-900 dark:text-white">
          {created.code}
        </p>
        <div className="flex flex-col gap-3">
          <SubmitButton onClick={() => void copy()}>
            {copied ? "Copied" : "Copy code"}
          </SubmitButton>
          <SubmitButton onClick={() => void navigate(`/room/${created.code}`)}>
            Start studying
          </SubmitButton>
        </div>
      </FormWrapper>
    );

  return (
    <FormWrapper>
      <FormHeader title="Study together" subtitle="Create a room or join one" />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <TimeInputControl label="Study (min)" value={focusMinutes} onChange={setFocusMinutes} />
          <TimeInputControl label="Break (min)" value={breakMinutes} onChange={setBreakMinutes} />
        </div>
        <SubmitButton onClick={() => void create()}>Create room</SubmitButton>

        <div className="flex items-center">
          <div className="flex-1 border-t border-gray-300" />
          <span className="mx-3 text-sm text-gray-500">or</span>
          <div className="flex-1 border-t border-gray-300" />
        </div>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Room code"
          className="w-full px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 placeholder:font-custom dark:text-white"
        />
        <SubmitButton onClick={() => void join()}>Join room</SubmitButton>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </FormWrapper>
  );
}
```

### U4. `frontend/src/components/Navbar.tsx` (remove About)

Delete line 101: `<NavbarButton to="/about" content="About" onClick={closeMenu} />` (and the blank line around it if it leaves two in a row). `App.tsx` (R3) no longer has the `/about` route.

### Create (13)

Create each of these new files with the code below, in this order. `RoomPage.tsx` is not in this list because R1 already produced it. Do not build until `App.tsx` (R3) is updated; it comes last.

### C1. `frontend/src/roomClient.ts`

The only place the UI talks to rooms. Tab-local stub until the WebSocket client replaces the three functions. No timer logic.

```ts
// Everything the UI needs from the realtime layer. The WebSocket client built
// by your teammate replaces the body of these three functions; their
// signatures (and therefore every page) stay the same.
//
// Until then rooms only exist inside this browser tab, so creating a room and
// opening its page works, but a second person cannot join it.

export interface RoomSettings {
  focusSeconds: number;
  breakSeconds: number;
}

export interface RoomHandle {
  code: string;
  settings: RoomSettings;
}

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const rooms = new Map<string, RoomHandle>();

/** Creates a room and returns its shareable code. */
export function createRoom(settings: RoomSettings): Promise<RoomHandle> {
  const code = Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
  const room = { code, settings };
  rooms.set(code, room);
  return Promise.resolve(room);
}

/** Joins an existing room by code (also used to join a friend's room). */
export function joinRoom(code: string): Promise<RoomHandle> {
  const room = rooms.get(code);
  return room ? Promise.resolve(room) : Promise.reject(new Error("Room not found"));
}

/** Leaves the room. The realtime layer saves the study time on its side. */
export function leaveRoom(code: string): void {
  rooms.delete(code);
}
```

### C2. `frontend/src/pages/MainPage.tsx`

The `/create` page.

```tsx
import CreateRoom from '../components/CreateRoom';

export default function MainPage() {
  return (
    <div className="w-full flex items-center justify-center">
      <CreateRoom />
    </div>
  );
}
```

### C3. `frontend/src/components/RegisteredRoute.tsx`

Keeps guests out of friends and profile.

```tsx
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../authStore";

// Guests have no profile, stats or friends: send them back to the room page.
export const RegisteredRoute = () => {
  const user = useAuthStore((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/create" replace />;
};
```

### C4. `frontend/src/views/ProfileView.tsx`

Profile tabs: General and Security.

```tsx
import { NavLink, Outlet } from "react-router";

// 1. Extraemos la función fuera del componente. No se recrea en cada render.
// 2. Limpiamos las redundancias de Tailwind y arreglamos las clases inexistentes.
const getTabStyles = ({ isActive }: { isActive: boolean }) => {
  const baseClasses =
    "px-4 py-2 rounded-full font-medium transition-colors text-black hover:bg-gray-100";
  const activeClasses = isActive ? "bg-gray-100 font-semibold" : "";

  return `${baseClasses} ${activeClasses}`.trim();
};

export const ProfileView = () => {
  return (
    <div className="flex flex-col flex-grow">
      <nav className="flex space-x-2 p-4">
        <NavLink to="/profile" end className={getTabStyles}>
          General
        </NavLink>
        <NavLink to="/profile/security" className={getTabStyles}>
          Seguridad
        </NavLink>
      </nav>

      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
};
```

### C5. `frontend/src/pages/SecurityPanel.tsx`

Enable and disable 2FA, delete account.

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, post, errMsg } from "../api";
import { useAuthStore } from "../authStore";

export default function SecurityPanel() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ enabled: boolean }>("/auth/2fa")
      .then((r) => setEnabled(r.enabled))
      .catch((err: unknown) => setMessage(errMsg(err)));
  }, []);

  if (enabled === null) return <p className="text-gray-500">{message || "Cargando..."}</p>;

  const action = enabled ? "disable" : "enable";

  const requestCode = async () => {
    setMessage("");
    try {
      await post(`/auth/2fa/${action}/request`, { password });
      setCodeSent(true);
      setMessage("Te hemos enviado un código por email.");
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  const confirm = async () => {
    setMessage("");
    try {
      await post(`/auth/2fa/${action}`, { password, code });
      setEnabled(!enabled);
      setCodeSent(false);
      setCode("");
      setPassword("");
      setMessage(enabled ? "Verificación en dos pasos desactivada." : "Verificación en dos pasos activada.");
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("¿Borrar tu cuenta para siempre?")) return;
    try {
      await api("/users/me", { method: "DELETE", body: JSON.stringify({ password }) });
      logout();
      void navigate("/");
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-bold text-gray-900">Seguridad</h1>
      <p className="text-sm text-gray-600">
        Verificación en dos pasos: <strong>{enabled ? "activada" : "desactivada"}</strong>
      </p>

      <input
        type="password"
        placeholder="Tu contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm"
      />

      {codeSent && (
        <input
          type="text"
          placeholder="Código de 6 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm"
        />
      )}

      <div className="flex gap-3">
        <button
          onClick={() => void (codeSent ? confirm() : requestCode())}
          className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
        >
          {codeSent ? "Confirmar" : enabled ? "Desactivar" : "Activar"}
        </button>
        <button
          onClick={() => void deleteAccount()}
          className="px-4 py-2 rounded-full border border-red-600 text-red-600 text-sm font-semibold hover:bg-red-50"
        >
          Borrar cuenta
        </button>
      </div>

      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  );
}
```

### C6. `frontend/src/pages/VerifyCode.tsx`

Signup email code (`/signup/verify`).

```tsx
import { Navigate, useLocation, useNavigate } from "react-router";
import SingleFieldForm from "../components/SingleFieldForm";
import { post } from "../api";
import { useAuthStore, type AuthUser } from "../authStore";

export default function VerifyCode() {
  const pendingToken = (useLocation().state as { pendingToken?: string } | null)?.pendingToken;
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  if (!pendingToken) return <Navigate to="/signup" replace />;

  return (
    <SingleFieldForm
      title="Check your email"
      subtitle="Enter the 6-digit code we sent you"
      label="Code"
      placeholder="123456"
      button="Verify"
      onSubmit={async (code) => {
        const res = await post<{ token: string; user: AuthUser }>("/auth/signup/verify", {
          pendingToken,
          code,
        });
        setSession(res.token, res.user);
        void navigate("/create");
      }}
      extra={
        <button
          type="button"
          className="mt-4 text-sm font-bold text-gray-500 hover:text-black"
          onClick={() => void post("/auth/signup/resend", { pendingToken })}
        >
          Resend code
        </button>
      }
    />
  );
}
```

### C7. `frontend/src/pages/OAuthCallback.tsx`

Receives `?code=`, `?pending=` or `?error=` after OAuth.

```tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { post } from "../api";
import { useAuthStore, type AuthUser } from "../authStore";

// The backend redirects here with ?code= (existing account), ?pending= (new
// account, still needs the emailed code) or ?error=.
export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const pending = params.get("pending");
    const code = params.get("code");
    if (pending) {
      void navigate("/signup/verify", { replace: true, state: { pendingToken: pending } });
      return;
    }
    if (!code) {
      void navigate("/", { replace: true });
      return;
    }
    post<{ token: string; user: AuthUser }>("/auth/oauth/exchange", { code })
      .then((res) => {
        setSession(res.token, res.user);
        void navigate("/create", { replace: true });
      })
      .catch(() => void navigate("/", { replace: true }));
  }, [params, navigate, setSession]);

  return <p className="p-6">Signing you in…</p>;
}
```

### C8. `frontend/src/pages/VerifyEmail.tsx`

Email verification target.

```tsx
import { useNavigate } from "react-router";
import SingleFieldForm from "../components/SingleFieldForm";
import { post } from "../api";

// For a signed-in user whose email is unverified (e.g. after changing it).
export default function VerifyEmail() {
  const navigate = useNavigate();

  return (
    <SingleFieldForm
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent you"
      label="Code"
      placeholder="123456"
      button="Verify"
      onSubmit={async (code) => {
        await post("/auth/verify-email", { code });
        void navigate("/profile");
      }}
      extra={
        <button
          type="button"
          className="mt-4 text-sm font-bold text-gray-500 hover:text-black"
          onClick={() => void post("/auth/verify-email/resend")}
        >
          Resend code
        </button>
      }
    />
  );
}
```

### C9. `frontend/src/pages/ForgotPassword.tsx`

Password reset request.

```tsx
import { useNavigate } from "react-router";
import SingleFieldForm from "../components/SingleFieldForm";
import { post } from "../api";

export default function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <SingleFieldForm
      title="Forgot your password?"
      subtitle="We will email you a code"
      label="Email"
      type="email"
      placeholder="you@student.42madrid.com"
      button="Send code"
      onSubmit={async (email) => {
        await post("/auth/password-reset/request", { email });
        void navigate("/auth/reset-password", { state: { email } });
      }}
    />
  );
}
```

### C10. `frontend/src/pages/ResetPassword.tsx`

Reset code and new password.

```tsx
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import SingleFieldForm from "../components/SingleFieldForm";
import { post } from "../api";

export default function ResetPassword() {
  const email = (useLocation().state as { email?: string } | null)?.email;
  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState<string | null>(null);

  if (!email) return <Navigate to="/auth/forgot-password" replace />;

  if (resetToken)
    return (
      <SingleFieldForm
        key="password"
        title="New password"
        subtitle="Choose a new password"
        label="Password"
        type="password"
        button="Save"
        onSubmit={async (password) => {
          await post("/auth/password-reset/confirm", { resetToken, password });
          void navigate("/");
        }}
      />
    );

  return (
    <SingleFieldForm
      key="code"
      title="Check your email"
      subtitle="Enter the 6-digit code"
      label="Code"
      placeholder="123456"
      button="Continue"
      onSubmit={async (code) => {
        const res = await post<{ resetToken: string }>("/auth/password-reset/verify", {
          email,
          code,
        });
        setResetToken(res.resetToken);
      }}
    />
  );
}
```

### C11. `frontend/src/pages/Friends.tsx`

Add by username, requests, remove, online dot, in-a-room and Join.

```tsx
import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    try {
      setList(await api<FriendList>("/friends"));
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  // Refreshes presence every 10 s; the WebSocket layer can push it later.
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
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
          onChange={(e) => setUsername(e.target.value)}
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

### C12. `frontend/src/pages/Admin.tsx`

Connected guests and registered users, with Delete.

```tsx
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../api";
import { useAuthStore } from "../authStore";

interface AdminUser {
  id: number;
  username: string;
  email?: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}
interface AdminGuest {
  id: string;
  displayName: string;
}

export default function Admin() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>("/admin/users?take=100"));
      setGuests(await api<AdminGuest[]>("/admin/guests"));
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (path: string, name: string) => {
    if (!window.confirm(`Delete ${name}? They are removed from their room right away.`)) return;
    setError("");
    try {
      await api(path, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div className="flex-grow p-6 space-y-8 dark:text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administration</h1>
        <button className="text-sm text-gray-600 dark:text-gray-300" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Connected guests ({guests.length})</h2>
        <ul className="space-y-2">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow border border-gray-100 dark:bg-slate-800 dark:border-slate-700">
              <span>{g.displayName}</span>
              <button className="text-sm text-red-600" onClick={() => void remove(`/admin/guests/${g.id}`, g.displayName)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Registered users ({users.length})</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2">ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2">{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.id !== me?.id && (
                    <button className="text-red-600" onClick={() => void remove(`/admin/users/${u.id}`, u.username)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

### C13. `frontend/src/pages/Ejected.tsx`

Where a deleted person lands.

```tsx
import { Link } from "react-router";

export default function Ejected() {
  return (
    <div className="flex-grow flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">You have been ejected</h1>
      <p className="max-w-md text-gray-600 dark:text-gray-300">
        An administrator removed your account or guest, or your session ended.
      </p>
      <Link to="/" className="rounded-full bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">
        Back to the start
      </Link>
    </div>
  );
}
```

### R3. `frontend/src/App.tsx` (replace, last)

Final route tree. Last file: it imports everything above.

```tsx
import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import VerifyCode from "./pages/VerifyCode";
import OAuthCallback from "./pages/OAuthCallback";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Ejected from "./pages/Ejected";
import MainPage from "./pages/MainPage";
import RoomPage from "./pages/RoomPage";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import SecurityPanel from "./pages/SecurityPanel";
import Admin from "./pages/Admin";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { RegisteredRoute } from "./components/RegisteredRoute";
import { AdminRoute } from "./components/AdminRoute";
import { ProfileView } from "./views/ProfileView";

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signup/verify" element={<VerifyCode />} />
        <Route path="/auth/oauth" element={<OAuthCallback />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/ejected" element={<Ejected />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedLayout />}>
        <Route path="/create" element={<MainPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route element={<RegisteredRoute />}>
          <Route path="/friends" element={<Friends />} />
          <Route path="/profile" element={<ProfileView />}>
            <Route index element={<Profile />} />
            <Route path="security" element={<SecurityPanel />} />
          </Route>
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
```

### Then build

`cd frontend && npx tsc -b && npm run build`, then `make re`.

### Check it by hand

**Backend** (`cd backend`): `npx tsc --noEmit && npm run lint && npx prettier --check src`.

**Frontend** (`cd frontend`): `npx tsc -b && npm run build`, then `make re`.

**By hand, what you can test now**
1. Open `/` in a private window: Guest tab, type a name, Enter. You land on `/create`. Open the sidebar: only Rooms and Exit. `/friends` and `/profile` bounce you back to `/create`.
2. Close that tab, open `/` again: you are asked again (new guest). In the database the old guest disappears within a minute (expiry sweeper) or at once if you pressed Exit.
3. Register: username, email, password, then the 6-digit code (printed in the backend log when SMTP is not configured). You land on `/create`. Log in with the same account: also `/create`. OAuth needs the provider credentials in the backend `.env` and `FRONTEND_URL` pointing at the Vite URL.
4. Forgot password from the sign-in form; 2FA on and off in Profile, Security.
5. Profile: change username, upload an avatar (png, jpeg or webp, 512 KB max). Statistics show zeros; to see numbers, seed them: `INSERT INTO "UserStat" ("userId","focusedSeconds","wins","losses") VALUES (<id>, 7200, 3, 1) ON CONFLICT ("userId") DO UPDATE SET "focusedSeconds"=7200, "wins"=3, "losses"=1;`.
6. Friends: two accounts; add by username from one, accept in the other, remove. Both show offline (no realtime yet).
7. Admin: make yourself admin with `npm run users:role -- <your-username> admin` in the backend container, log out and in again (the role comes from the login response). Open `/admin`: connected guests and all users. Delete a guest or user that is logged in in another window: their next request opens `/ejected`.
8. Create a room: durations, Create room, copy the code, Start studying: you reach `/room/<code>` with the timer UI and Leave. Joining that code from another browser fails with "Room not found" until the WebSocket layer exists.

**Waiting for teammates, do not expect it to work yet:** a second person joining a room, timer sync, friends going online or showing a room, study time being saved, the live eject of someone inside a room, guests deleted on tab close by disconnect, minigames.

---

## 4. Optional

- Tomato: `src/components/Tomato.tsx` is not imported anywhere. Its CSS (`.tomato`, `.tomato-body`) is not in his `index.css`; copy it from `git show 4211d5e:frontend/src/index.css` if you want it.
- Role `MODERATOR` is now only a read-only admin list; remove it from the enum, `src/users/role.ts`, `requireStaff` and the frontend `AuthUser` type if you do not want it.

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
        |               |  (2FA code)   |  -> /signup/verify (6-digit code)
        |               |  or OAuth     |                  |
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
            Admin:      the above + Admin
```

### 5.3 Routes

| Route | Who | What |
|---|---|---|
| `/` | everyone (logged-in people are sent to `/create`) | Guest / Log in / Register tabs |
| `/signup`, `/signup/verify` | everyone | Registration and the 6-digit code |
| `/auth/oauth` | everyone | OAuth return page (exchanges the one-time code for a token) |
| `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` | everyone | Email verification and password reset |
| `/ejected` | everyone | "Your account or session was removed" page (opened on any 401 while logged in) |
| `/create` | guest, registered, admin | Create or join a room |
| `/room/:code` | guest, registered, admin | The room |
| `/friends` | registered, admin (guests bounce to `/create`) | Friends list, requests, add by username, Join their room |
| `/profile`, `/profile/security` | registered, admin | Username, avatar, statistics; 2FA |
| `/admin` | admin only | Connected guests and all users, with Delete |

### 5.4 Flows

**Guest.** Guest tab, a username, Enter. `POST /api/auth/guest` creates a `GuestSession` and returns a token. You land on `/create`. You can create and join rooms. You have no friends, profile or statistics. Exit calls `POST /api/auth/logout`, which deletes the row. If you just close the tab, the sessionStorage token is gone and the row is deleted by the teammates' disconnect handler, or at the latest by the minute sweeper.

**Register.** Username, email, password. `POST /api/auth/signup` stores a `PendingSignup` and emails a 6-digit code (printed in the backend log without SMTP). `POST /api/auth/signup/verify` creates the `User` and `UserStat`, and returns a token. Land on `/create`.

**Log in.** `POST /api/auth/login`. With 2FA on, the answer is a challenge: the form asks for the emailed code (`/api/auth/login/2fa`). OAuth goes `/api/auth/oauth/:provider` to the provider, back to the callback, then `/auth/oauth` in the frontend exchanges the code (`POST /api/auth/oauth/exchange`). Forgot password: `password-reset/request`, `verify`, `confirm`.

**Room.** Rooms are never stored. Creating one sets study and break minutes and produces a case-sensitive 8-character code to share. There is no owner. Anyone with the code joins and follows the same timer. All of this lives in the teammates' WebSocket layer (in memory). Until it exists, `roomClient.ts` is a tab-local stub, so only the creator can enter.

**Leaving a room.** The realtime layer measures the focus seconds and calls `addFocusedSeconds(ctx, userId, seconds)` for registered users only, then deletes a guest. This runs on Leave and on tab close. It is not an HTTP endpoint, so nobody can credit themselves.

**Friends** (registered only). Add by username (`POST /api/friends`). If the other person already asked you, it is accepted instead. They accept (`POST /api/friends/:id/accept`) or either side removes (`DELETE /api/friends/:id`). `GET /api/friends` returns `friends`, `incoming`, `outgoing`; each accepted friend carries `presence { online, roomCode }`, which comes from `ctx.realtime.presence(userId)` (offline until the teammates plug it in). A friend in a room shows a Join button that goes to `/room/<roomCode>`.

**Profile** (registered only). Change username, upload or remove an avatar (png, jpeg, webp, 512 KB max), turn 2FA on or off (each with an emailed code), see statistics: **studied time, minigame wins, minigame losses** and nothing else.

**Admin.** `/admin` lists connected guests (`GET /api/admin/guests`) and all users (`GET /api/admin/users`). Delete a guest (`DELETE /api/admin/guests/:id`) or a user (`DELETE /api/admin/users/:id`). The row is deleted first, so every token dies at once; then `ctx.realtime.eject(identity)` removes the person from their room live. Their next request returns 401 and the page opens `/ejected`. Everyone else gets 403 on these routes.

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
