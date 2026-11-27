import { create } from "zustand";

interface NoticeState {
  ejected: boolean;
  showEjected: () => void;
  clear: () => void;
}

export const useNoticeStore = create<NoticeState>((set) => ({
  ejected: false,
  showEjected: () => {
    set({ ejected: true });
  },
  clear: () => {
    set({ ejected: false });
  },
}));
