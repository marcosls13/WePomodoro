// authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mockLogin } from "./authService";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginAction: (username: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      isAuthenticated: true,
      isLoading: false,

      loginAction: async (username: string) => {
        set({ isLoading: true }); // Bloquea el botón de UI
        try {
          // Aquí llamas a tu mock. Mañana cambiarás esto por: await api.post('/login', ...)
          const fakeToken = await mockLogin(username);

          set({
            token: fakeToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
        }
      },

      logout: () => set({ token: null, isAuthenticated: false }),
    }),
    { name: "transcendence-auth" },
  ),
);
