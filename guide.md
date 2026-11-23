# Frontend merge: final state of every file

Everything below was compiled before being written here: I put these exact files in a scratch copy of your current `frontend/` and `npx tsc` passes with no errors and `vite build` succeeds. It has **not** been run against the live backend, so test each flow once.

Right now your tree fails `tsc` in `authStore.ts` (unused `use` import), `SigninForm.tsx` (no password field), `SignupForm.tsx` (hooks outside the component, missing states) and `App.tsx` (broken nesting, pages that don't exist yet). All of that is fixed by the files below.

## How to apply

1. Delete `src/authService.ts` (the mock) and `src/components/ProtectedRoute.tsx` (redundant: `ProtectedLayout` already does the check).
2. Replace or create each file below, in this order (each only depends on the ones before it). `App.tsx` is last.
3. `cd frontend && npx tsc -b && npm run build`, then `make re`.

Files not listed here stay as they are (`ProfileView.tsx` already has the History tab; `Room.tsx`, `Timer.tsx`, `Chat.tsx` and `TimeConfig.tsx` are no longer routed, keep them as reference for the timer UI and delete them when you've ported what you want into `Session.tsx`).

## Things to know before testing

- **Guests** (`/auth/guest`) can enter the protected area but the backend rejects the registered-only endpoints for them (profile, stats, friends, 2FA). Expect an error message there, or hide those links when `user` is `null`.
- **Admin**: `AdminRoute` checks `user.role`, which comes from the login response. If you were already logged in before this change, log out and in again.
- **OAuth** needs the provider credentials in the backend `.env` and `FRONTEND_URL` pointing at the Vite URL (default `http://localhost:5173`). `GET /api/auth/oauth` returns which providers are enabled.
- **Signup** only sends `username`, `email`, `password`: the old name / lastname fields are gone because the backend has no such columns.
- **Session timer** polls every 5 s. The backend mentions a WebSocket layer; if you want live updates, switch `Session.tsx` to it later.

---

## 1. `src/api.ts` (new / replace)

Shared fetch helper. Adds the Bearer token, throws the backend's `error` message, and has a `post` shortcut. Yours works; this version also surfaces the backend's error text and exports `errMsg`.

```ts
import { useAuthStore } from "./authStore";

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T,>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";
```

## 2. `src/authStore.ts` (replace)

Same as yours without the stray `import { use } from "react"` (that is the `'use' is declared but never read` error).

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
}

interface AuthState {
  token: string | null;
  user: AuthUser | null; // null for guests
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setSession: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    { name: "transcendence-auth" },
  ),
);
```

## 3. `src/components/AdminRoute.tsx` (replace)

Only formatting changes from yours.

```tsx
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../authStore";

export const AdminRoute = () => {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" ? <Outlet /> : <Navigate to="/create" replace />;
};
```

## 4. `src/components/SingleFieldForm.tsx` (new)

One reusable card with a single input, error line and submit button. The five code/email/name pages below are just this component with different props, so you don't repeat the markup five times.

```tsx
import { useState } from "react";
import FormWrapper from "./FormWrapper";
import { FormHeader } from "./FormHeader";
import { InputField } from "./InputField";
import { SubmitButton } from "./SubmitButton";
import { errMsg } from "../api";

interface SingleFieldFormProps {
  title: string;
  subtitle: string;
  label: string;
  button: string;
  type?: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
  extra?: React.ReactNode;
}

export default function SingleFieldForm({
  title,
  subtitle,
  label,
  button,
  type = "text",
  placeholder,
  onSubmit,
  extra,
}: SingleFieldFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="flex-grow flex items-center justify-center p-6">
      <FormWrapper>
        <FormHeader title={title} subtitle={subtitle} />
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <InputField
            id="field"
            label={label}
            type={type}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton>{button}</SubmitButton>
        </form>
        {extra}
      </FormWrapper>
    </div>
  );
}
```

## 5. `src/components/SigninForm.tsx` (replace)

Fixes: the second field was a copy of the username field (so `setPassword` was unused and there was no password), adds the OAuth `onClick`s, forgot-password and guest links, and shows the backend's error text. `type="button"` on the OAuth buttons stops them from submitting the form.

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { OAuthSubmitButton } from "./OAuthSubmitButton";
import FormWrapper from "./FormWrapper";
import { GitHubIcon, GoogleIcon, FortyTwoIcon } from "./icons/Icons.tsx";
import { post, errMsg } from "../api";
import { useAuthStore, type AuthUser } from "../authStore.ts";

interface SignInFormProps {
  onSwitchMode: () => void;
}

type LoginOk = { token: string; user: AuthUser };
type Challenge = { twoFactorRequired: true; challengeToken: string };

const oauth = (provider: "42" | "google" | "github") => {
  window.location.href = `/api/auth/oauth/${provider}`;
};

export default function SignInForm({ onSwitchMode }: SignInFormProps) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = challengeToken
        ? await post<LoginOk>("/auth/login/2fa", { challengeToken, code })
        : await post<LoginOk | Challenge>("/auth/login", { username, password });
      if ("twoFactorRequired" in res) {
        setChallengeToken(res.challengeToken);
        return;
      }
      setSession(res.token, res.user);
      void navigate("/create");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <FormWrapper>
      <FormHeader
        title="Join the session"
        subtitle="Sync your focus with the team"
      />
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        {challengeToken ? (
          <InputField
            id="code"
            label="Code from your email"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        ) : (
          <>
            <InputField
              id="username"
              label="Username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <InputField
              id="password"
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <SubmitButton>Sign In</SubmitButton>
      </form>

      <div className="flex justify-between px-2 mt-3 text-sm text-gray-500">
        <Link to="/auth/forgot-password" className="hover:text-black">Forgot password?</Link>
        <Link to="/auth/guest" className="hover:text-black">Continue as guest</Link>
      </div>

      <div className="flex items-center my-5">
        <div className="flex-1 border-t border-gray-300"></div>
        <span className="mx-3 text-gray-500 text-sm">or</span>
        <div className="flex-1 border-t border-gray-300"></div>
      </div>
      <div className="flex flex-col">
        <div className="flex justify-center align-center gap-4 mb-2">
          <OAuthSubmitButton type="button" onClick={() => oauth("42")}><FortyTwoIcon /></OAuthSubmitButton>
          <OAuthSubmitButton type="button" onClick={() => oauth("google")}><GoogleIcon /></OAuthSubmitButton>
          <OAuthSubmitButton type="button" onClick={() => oauth("github")}><GitHubIcon /></OAuthSubmitButton>
        </div>
        <button
          onClick={onSwitchMode}
          className="text-sm font-bold text-gray-500 hover:text-black transition-colors"
        >
          Back
        </button>
      </div>
    </FormWrapper>
  );
}
```

## 6. `src/components/SignupForm.tsx` (replace)

Fixes: `useNavigate()` and `useState` were called at module level (outside the component, which React forbids) and the `username` / `email` / `password` states were missing.

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";

export default function SignUpForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const { pendingToken } = await post<{ pendingToken: string }>("/auth/signup", {
        email,
        username,
        password,
      });
      void navigate("/signup/verify", { state: { pendingToken } });
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="w-full max-w-md animate-slide-up [animation-delay:150ms]">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <FormHeader title="Sign Up" subtitle="Take Advantage" />
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <InputField
            id="username"
            label="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
          <InputField
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@student.42madrid.com"
          />
          <InputField
            id="password"
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton>Sign Up</SubmitButton>
        </form>
      </div>
    </div>
  );
}
```

## 7. `src/components/CreatePanel.tsx` (replace)

Create and Join now call the backend. `onSwitchMode` is optional: `Home` passes it (a visitor who isn't signed in is sent to the login panel when pressing Create/Join), `MainPage` doesn't. I removed the `uppercase` class from the join input: room codes are case-sensitive (mixed upper/lower case), so showing them uppercase would make a correct code look wrong.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SubmitButton } from "../components/SubmitButton";
import { FormHeader } from "../components/FormHeader";
import FormWrapper from "../components/FormWrapper";
import { post, errMsg } from "../api";
import { useAuthStore } from "../authStore";

type PanelMode = 'idle' | 'create' | 'join';

interface CreatePanelProps {
  onSwitchMode?: () => void;
}

export default function CreatePanel({ onSwitchMode }: CreatePanelProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mode, setMode] = useState<PanelMode>('idle');
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleAction = async (targetMode: 'create' | 'join') => {
    if (mode === 'idle') {
      setMode(targetMode);
      setInputValue('');
      setError('');
      return;
    }

    if (mode === targetMode) {
      if (inputValue.trim() === '') return;
      // Not signed in: send the visitor to the login panel instead.
      if (!isAuthenticated) {
        onSwitchMode?.();
        return;
      }
      try {
        const session =
          targetMode === 'create'
            ? await post<{ id: string }>('/sessions', { name: inputValue.trim(), solo: false })
            : await post<{ id: string }>('/sessions/join', { code: inputValue.trim() });
        void navigate(`/sessions/${session.id}`);
      } catch (err) {
        setError(errMsg(err));
      }
    }
  };

  return (
    <FormWrapper>
    <section className="flex flex-col flex-auto items-center justify-center min-h-[300px]">
      <FormHeader title="Join the session" subtitle="Come on bro"/>
      <div className="relative flex flex-col items-center justify-center w-full">
        
        <div 
          className={`flex flex-col items-center transition-all duration-500 ease-out overflow-hidden
            ${mode === 'join' ? 'max-h-0 opacity-0 pointer-events-none transform -translate-y-4' : 'max-h-48 opacity-100 transform translate-y-0'}
          `}
        >
          <div 
            className={`transition-all duration-500 ease-out overflow-hidden flex flex-col items-center w-full
              ${mode === 'create' ? 'max-h-20 opacity-100 mb-4 transform scale-100' : 'max-h-0 opacity-0 mb-0 transform scale-95'}
            `}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter room name"
              className="px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 w-64"
            />
          </div>
          
          <SubmitButton onClick={() => void handleAction('create')}>
            {mode === 'create' ? 'Create Room' : 'Create Room'}
          </SubmitButton>
        </div>

        <div 
          className={`flex flex-col items-center transition-all duration-500 ease-out overflow-hidden
            ${mode === 'create' ? 'max-h-0 opacity-0 pointer-events-none transform translate-y-4' : 'max-h-48 opacity-100 transform translate-y-0 mt-4'}
            ${mode === 'join' && 'mt-0'} 
          `}
        >
          <div 
            className={`transition-all duration-500 ease-out overflow-hidden flex flex-col items-center w-full
              ${mode === 'join' ? 'max-h-20 opacity-100 mb-4 transform scale-100' : 'max-h-0 opacity-0 mb-0 transform scale-95'}
            `}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Room code"
              className="px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 w-64"
            />
          </div>
          
          <SubmitButton onClick={() => void handleAction('join')}>
            {mode === 'join' ? 'Join Room' : 'Join Room'}
          </SubmitButton>
        </div>

      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className={`transition-all duration-500 ease-out mt-6 ${mode !== 'idle' ? 'opacity-100 transform translate-y-0' : 'opacity-0 pointer-events-none transform translate-y-2'}`}>
        <button 
          onClick={() => setMode('idle')}
          className="text-sm font-bold text-gray-400 hover:text-black transition-colors"
        >
          Cancel
        </button>
      </div>
{onSwitchMode && (
        <button
          onClick={onSwitchMode}
          className="mt-4 text-sm font-bold text-gray-500 hover:text-black transition-colors"
        >
          Discover our advantages by Signing Up
        </button>
      )}
    </section>
    </FormWrapper>
  );
}
```

## 8. `src/pages/MainPage.tsx` (replace)

No more `navigate("/signup")`: this page is behind login, so the "Sign Up" button isn't needed.

```tsx
import CreatePanel from '../components/CreatePanel';

export default function MainPage() {
  return (
    <div className="w-full flex items-center justify-center">
      <CreatePanel />
    </div>
  );
}
```

## 9. `src/components/Profilebar.tsx` (replace)

The four `/chat` links now point to `/create`, `/profile/history`, `/sessions` and `/friends` (change the targets if you prefer another mapping).

```tsx
import { useState } from "react";
import { NavLink } from "react-router";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { Calculator, History, Code, Add, Profile, Burger } from "./icons/Icons";

const sidebarVariants: Variants = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      bounce: 0,
      duration: 0.5,
      staggerChildren: 0.08, 
      delayChildren: 0.1,
    },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: {
      type: "spring",
      bounce: 0,
      duration: 0.4,
    },
  },
};

const itemVariants: Variants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1 },
};

export default function Profilebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed top-4 right-4 z-50 bg-white p-3 rounded-full shadow-md hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="Toggle Menu"
      >
        <Burger />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            variants={sidebarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-20 right-0 z-45 flex flex-col gap-2 w-fit rounded-full bg-white shadow-xl m-6 p-3 items-center"
          >
            <motion.div variants={itemVariants}>
              <NavLink to="/create">
                <div className="bg-red-600 p-3 rounded-full">
                  <Calculator />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/profile/history">
                <div className="bg-red-600 rounded-full p-3 flex items-center justify-center">
                  <History />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/sessions">
                <div className="bg-red-600 rounded-full p-3 flex items-center justify-center">
                  <Code />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/friends">
                <div className="bg-red-600 rounded-full p-3">
                  <Add />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-auto">
              <NavLink to="/profile">
                <div className="bg-red-600 rounded-full p-3">
                  <Profile />
                </div>
              </NavLink>
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
```

## 10. `src/store/profileStore.ts` (replace)

Real data from `GET /users/me` and `PATCH /users/me` instead of the hardcoded `fdurban-` user. The backend has `username`, not `login_42` / `name`.

```ts
import { create } from "zustand";
import { api } from "../api";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  emailVerifiedAt: string | null;
}

interface ProfileState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  avatarVersion: number;
  fetchUser: () => Promise<void>;
  updateUsername: (newName: string) => Promise<void>;
  bumpAvatar: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  user: null,
  isLoading: false,
  error: null,
  avatarVersion: 0,

  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ user: await api<UserProfile>("/users/me"), isLoading: false });
    } catch {
      set({ error: "Could not load your profile", isLoading: false });
    }
  },

  updateUsername: async (newName: string) => {
    const user = await api<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ username: newName }),
    });
    set({ user });
  },

  // Forces the <img> to reload after an upload or removal.
  bumpAvatar: () => set((s) => ({ avatarVersion: s.avatarVersion + 1 })),
}));
```

## 11. `src/pages/Profile.tsx` (replace)

Uses the real user, uploads an avatar (`PUT /users/me/avatar`) and has the logout button.

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useProfileStore } from "../store/profileStore";
import { useAuthStore } from "../authStore";
import { api, post, errMsg } from "../api";

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

  if (!user) return <div className="animate-pulse text-gray-500">Cargando perfil...</div>;

  return (
    <div className="space-y-8">
      <section className="flex items-center space-x-6">
        <div className="w-24 h-24 rounded-full bg-gray-200 border-2 border-gray-300 overflow-hidden flex-shrink-0">
          <img
            src={`/api/users/${user.id}/avatar?v=${avatarVersion}`}
            alt={`Avatar de ${user.username}`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Información General</h1>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatar(file);
            }}
            className="text-sm"
          />
        </div>
      </section>

      <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Email</span>
            <span className="text-sm font-mono bg-gray-200 px-2 py-1 rounded">{user.email}</span>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-600">Nombre de usuario</span>

            {isEditing ? (
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-black outline-none"
                  autoFocus
                />
                <button
                  onClick={() => void handleSave()}
                  className="px-4 py-1 bg-black text-white font-medium rounded hover:bg-gray-800 transition-colors"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1 bg-gray-200 text-gray-800 font-medium rounded hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <span className="text-base font-semibold">{user.username}</span>
                <button
                  onClick={() => {
                    setDraftName(user.username);
                    setIsEditing(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => void handleLogout()}
        className="px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
```

## 12. `src/pages/SecurityPanel.tsx` (replace)

2FA on/off (password, then the emailed code) and account deletion.

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

## 13. `src/pages/VerifyCode.tsx` (new)

`/signup/verify`: the 6-digit code after signup. Also where OAuth sign-ups land.

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

## 14. `src/pages/SignGuest.tsx` (new)

`/auth/guest`.

```tsx
import { useNavigate } from "react-router";
import SingleFieldForm from "../components/SingleFieldForm";
import { post } from "../api";
import { useAuthStore } from "../authStore";

export default function SignGuest() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  return (
    <SingleFieldForm
      title="Continue as guest"
      subtitle="Pick a name; guests keep no stats or friends"
      label="Display name"
      placeholder="Anon"
      button="Join"
      onSubmit={async (displayName) => {
        const res = await post<{ token: string }>("/auth/guest", { displayName });
        setSession(res.token, null);
        void navigate("/create");
      }}
    />
  );
}
```

## 15. `src/pages/OAuthCallback.tsx` (new)

`/auth/oauth`: where the backend redirects after Google/GitHub/42 (`?code=`, `?pending=` or `?error=`).

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

## 16. `src/pages/VerifyEmail.tsx` (new)

`/auth/verify-email`: for a signed-in user with an unverified email.

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

## 17. `src/pages/ForgotPassword.tsx` (new)

`/auth/forgot-password`.

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

## 18. `src/pages/ResetPassword.tsx` (new)

`/auth/reset-password`: code first, then the new password.

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

## 19. `src/pages/Sessions.tsx` (new)

`/sessions`: list.

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";

interface PomodoroSession {
  id: string;
  name: string;
  code: string | null;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<PomodoroSession[]>("/sessions")
      .then(setSessions)
      .catch(() => setError("Could not load your sessions"));
  }, []);

  return (
    <div className="flex-grow p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Your sessions</h1>
        <Link to="/create" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          New / join
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {sessions.length === 0 && !error && <p className="text-gray-500">No sessions yet.</p>}
      {sessions.map((s) => (
        <Link
          key={s.id}
          to={`/sessions/${s.id}`}
          className="block rounded-xl bg-white p-4 shadow border border-gray-100 hover:shadow-md"
        >
          {s.name} {s.code ? "" : "(solo)"}
        </Link>
      ))}
    </div>
  );
}
```

## 20. `src/pages/Session.tsx` (new)

`/sessions/:sessionId`: the room. Polls the server every 5 s and counts down locally in between; the owner gets Start / Pause / Resume / Cancel.

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, post, errMsg } from "../api";

interface Member {
  id: string;
  displayName?: string;
  isOwner: boolean;
  isMe: boolean;
  isGuest: boolean;
}

interface SessionView {
  id: string;
  name: string;
  code: string | null;
  phase: "FOCUS" | "BREAK";
  timerStatus: "IDLE" | "RUNNING" | "PAUSED";
  remainingSeconds: number;
  members: Member[];
}

const format = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export default function Session() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionView | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<SessionView>(`/sessions/${sessionId ?? ""}`);
      setSession(data);
      setRemaining(data.remainingSeconds);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [sessionId]);

  // Re-sync with the server every 5 s; tick locally in between.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  const running = session?.timerStatus === "RUNNING";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!session) return <p className="p-6 text-gray-500">Loading…</p>;

  const isOwner = session.members.some((m) => m.isMe && m.isOwner);

  const timer = async (action: "start" | "pause" | "resume" | "cancel") => {
    try {
      await post(`/sessions/${session.id}/timer/${action}`);
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const leave = async () => {
    try {
      await post(`/sessions/${session.id}/leave`);
      void navigate("/sessions");
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const button = "rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700";

  return (
    <div className="flex-grow flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
      {session.code && (
        <p className="text-sm text-gray-600">
          Room code: <span className="font-mono font-bold">{session.code}</span>
        </p>
      )}

      <p className="text-sm uppercase tracking-wide text-gray-500">
        {session.phase === "FOCUS" ? "Focus" : "Break"} · {session.timerStatus.toLowerCase()}
      </p>
      <div className="text-8xl font-custom-timer">{format(remaining)}</div>

      {isOwner && (
        <div className="flex gap-3">
          {session.timerStatus === "IDLE" && <button className={button} onClick={() => void timer("start")}>Start</button>}
          {session.timerStatus === "RUNNING" && <button className={button} onClick={() => void timer("pause")}>Pause</button>}
          {session.timerStatus === "PAUSED" && <button className={button} onClick={() => void timer("resume")}>Resume</button>}
          {session.timerStatus !== "IDLE" && <button className={button} onClick={() => void timer("cancel")}>Cancel</button>}
        </div>
      )}

      <ul className="text-sm text-gray-700 space-y-1">
        {session.members.map((m) => (
          <li key={m.id}>
            {m.displayName ?? "?"} {m.isOwner && "👑"} {m.isMe && "(you)"} {m.isGuest && "(guest)"}
          </li>
        ))}
      </ul>

      <button onClick={() => void leave()} className="text-sm font-bold text-gray-500 hover:text-black">
        Leave session
      </button>
    </div>
  );
}
```

## 21. `src/pages/UserInfo.tsx` (new)

`/users/:userId`: public profile.

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api, errMsg } from "../api";

interface PublicProfile {
  id: number;
  username: string;
  createdAt: string;
  focusedSeconds: number;
  wins: number;
  losses: number;
}

export default function UserInfo() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<PublicProfile>(`/users/${userId ?? ""}`)
      .then(setProfile)
      .catch((err: unknown) => setError(errMsg(err)));
  }, [userId]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!profile) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="flex-grow flex flex-col items-center justify-center gap-4 p-6">
      <img
        src={`/api/users/${profile.id}/avatar`}
        alt={`Avatar de ${profile.username}`}
        className="w-24 h-24 rounded-full bg-gray-200 object-cover"
      />
      <h1 className="text-2xl font-bold text-gray-900">{profile.username}</h1>
      <p className="text-sm text-gray-600">
        {Math.floor(profile.focusedSeconds / 3600)} h focused · {profile.wins} wins · {profile.losses} losses
      </p>
    </div>
  );
}
```

## 22. `src/pages/Friends.tsx` (new)

`/friends`.

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, post, errMsg } from "../api";

interface Entry {
  id: string; // friendship id
  user: { id: number; username: string };
}
interface FriendList {
  friends: Entry[];
  incoming: Entry[];
  outgoing: Entry[];
}

export default function Friends() {
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

  useEffect(() => {
    void load();
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
    <li key={e.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow border border-gray-100">
      <Link to={`/users/${e.user.id}`} className="font-semibold">{e.user.username}</Link>
      <span className="flex gap-3 text-sm">{actions}</span>
    </li>
  );

  const remove = (e: Entry, label: string) => (
    <button className="text-red-600" onClick={() => void run(() => api(`/friends/${e.id}`, { method: "DELETE" }))}>
      {label}
    </button>
  );

  return (
    <div className="flex-grow p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Friends</h1>

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
          className="rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm"
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
        <ul className="space-y-2">{list.friends.map((e) => row(e, remove(e, "Remove")))}</ul>
      </section>
    </div>
  );
}
```

## 23. `src/pages/History.tsx` (new)

`/profile/history`: stats from `GET /users/me/stats`.

```tsx
import { useEffect, useState } from "react";
import { api, errMsg } from "../api";

interface Stats {
  focusedSeconds: number;
  wins: number;
  losses: number;
  played: number;
}

export default function History() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/users/me/stats")
      .then(setStats)
      .catch((err: unknown) => setError(errMsg(err)));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!stats) return <p className="text-gray-500">Cargando...</p>;

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold text-gray-900">Historial</h1>
      <p>Tiempo enfocado: <strong>{(stats.focusedSeconds / 3600).toFixed(1)} h</strong></p>
      <p>Partidas: <strong>{stats.played}</strong> ({stats.wins} ganadas, {stats.losses} perdidas)</p>
    </div>
  );
}
```

## 24. `src/pages/Admin.tsx` (new)

`/admin`: list users, change role, reset 2FA, delete.

```tsx
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../api";

type Role = "USER" | "MODERATOR" | "ADMIN";
interface AdminUser {
  id: number;
  username: string;
  email?: string;
  role: Role;
}

const json = (body: unknown) => JSON.stringify(body);

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>("/admin/users"));
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    void load();
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

  return (
    <div className="flex-grow p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Users</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
              <td>
                <select
                  value={u.role}
                  onChange={(e) =>
                    void run(() =>
                      api(`/admin/users/${u.id}`, { method: "PATCH", body: json({ role: e.target.value }) }),
                    )
                  }
                >
                  <option value="USER">USER</option>
                  <option value="MODERATOR">MODERATOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td className="space-x-3">
                <button
                  className="text-gray-600"
                  onClick={() => void run(() => api(`/admin/users/${u.id}/2fa`, { method: "DELETE" }))}
                >
                  Reset 2FA
                </button>
                <button
                  className="text-red-600"
                  onClick={() => {
                    if (window.confirm(`Delete ${u.username}?`))
                      void run(() => api(`/admin/users/${u.id}`, { method: "DELETE" }));
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## 25. `src/App.tsx` (replace)

Do this one last: it imports every page above. Fixes the broken `/profile` nesting (self-closed tag, missing `</Route>`) and the commented-out imports.

```tsx
import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import VerifyCode from "./pages/VerifyCode";
import SignGuest from "./pages/SignGuest";
import OAuthCallback from "./pages/OAuthCallback";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MainPage from "./pages/MainPage";
import Sessions from "./pages/Sessions";
import Session from "./pages/Session";
import UserInfo from "./pages/UserInfo";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import SecurityPanel from "./pages/SecurityPanel";
import History from "./pages/History";
import Admin from "./pages/Admin";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { AdminRoute } from "./components/AdminRoute";
import { ProfileView } from "./views/ProfileView";

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signup/verify" element={<VerifyCode />} />
        <Route path="/auth/guest" element={<SignGuest />} />
        <Route path="/auth/oauth" element={<OAuthCallback />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedLayout />}>
        <Route path="/create" element={<MainPage />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:sessionId" element={<Session />} />
        <Route path="/users/:userId" element={<UserInfo />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile" element={<ProfileView />}>
          <Route index element={<Profile />} />
          <Route path="security" element={<SecurityPanel />} />
          <Route path="history" element={<History />} />
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

## Optional, not needed for the build

- Tomato: `src/components/Tomato.tsx` isn't imported anywhere yet. Its CSS classes (`.tomato`, `.tomato-body`) aren't in his `index.css`; copy them from `git show 4211d5e:frontend/src/index.css` if you want the animation.
- `vite.config.ts`: remove his temporary `allowedHosts` trycloudflare entry once the tunnel is gone.
- `npm run lint` still reports style-level eslint errors (for example `no-confusing-void-expression` on `onClick={() => setX(...)}`). They don't block the build.


Al entrar guest login register, todos pueden crear sala