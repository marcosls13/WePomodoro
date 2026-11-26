import { create } from "zustand";
import { api } from "../api";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
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
  bumpAvatar: () => { set((s) => ({ avatarVersion: s.avatarVersion + 1 })); },
}));
