import { create } from 'zustand';
import { api } from '../api';

// 1. Tipado estricto del dominio. Define exactamente qué forma tiene un usuario.
interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  emailVerifiedAt: string | null;
}

// 2. El contrato del Store: Qué datos guarda y qué acciones expone.
interface ProfileState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  // avatarVersion: number;
  fetchUser: () => Promise<void>;
  updateUsername: (newName: string) => Promise<void>;
  // bumpAvatar: () => void;
}

// 3. Creación del motor de estado
export const useProfileStore = create<ProfileState>((set) => ({
  // Estado inicial. Usamos tu login real de 42 como mock inicial.
  user: null,
  isLoading: false,
  error: null,

  // Acción para cargar el perfil desde tu backend (NestJS)
  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      set({ user: await api<UserProfile>("/users/me"), isLoading: false });
    } catch (error) {
      set({ error: 'Error al obtener el perfil de la base de datos', isLoading: false });
    }
  },

  // Acción pura que usamos en el Profile.tsx
  updateUsername: async (newName: string) => {
    const user = await api<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ username: newName }),
    });
    set({ user });
  },
}));
