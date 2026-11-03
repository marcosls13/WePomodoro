// La interfaz define el contrato estricto de los roles
import {create} from "zustand"
type UserRole = 'registered' | 'guest' | null;

interface SessionState {
  id: string | number; // número para DB (registrado), string para UUID (invitado)
  name: string;
  role: UserRole;
  
  // Acciones
  loginAsGuest: () => void;
  // ... otras acciones de login con 42
}

export const useSessionStore = create<SessionState>((set) => ({
  id: '',
  name: '',
  role: null,

  loginAsGuest: () => {
    const tempId = `guest-${crypto.randomUUID()}`;
    set({ id: tempId, name: `Anon_${tempId.substring(6, 10)}`, role: 'guest' });
  }
}));
