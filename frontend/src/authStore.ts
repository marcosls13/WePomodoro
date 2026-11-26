import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
}

interface AuthState {
  token: string | null;
  user: AuthUser | null; // null for guests
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser | null) => void;
  logout: () => void;
}

// A registered user stays signed in across visits (localStorage). A guest lives
// only as long as its tab (sessionStorage): closing the tab forgets it, and the
// next visit starts a new guest.
const storage = createJSONStorage<Pick<AuthState, "token" | "user" | "isAuthenticated">>(
  () => ({
    getItem: (key) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
    setItem: (key, value) => {
      const state = (JSON.parse(value) as { state: { token: string | null; user: AuthUser | null } }).state;
      const guest = state.token !== null && state.user === null;
      (guest ? sessionStorage : localStorage).setItem(key, value);
      (guest ? localStorage : sessionStorage).removeItem(key);
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    },
  }),
);

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setSession: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    { name: "transcendence-auth", storage },
  ),
);
