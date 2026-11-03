import { create } from 'zustand';

// 1. Tipado estricto del dominio. Define exactamente qué forma tiene un usuario.
interface UserProfile {
  id: number;
  login_42: string;
  name: string;
  avatarUrl: string | null;
}

// 2. El contrato del Store: Qué datos guarda y qué acciones expone.
interface ProfileState {
  user: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  
  // Acciones asíncronas
  fetchUser: () => Promise<void>;
  updateUsername: (newName: string) => Promise<void>;
}

// 3. Creación del motor de estado
export const useProfileStore = create<ProfileState>((set, get) => ({
  // Estado inicial. Usamos tu login real de 42 como mock inicial.
  user: { 
    id: 1, 
    login_42: 'fdurban-', 
    name: 'Fernando', 
    avatarUrl: null 
  },
  isLoading: false,
  error: null,

  // Acción para cargar el perfil desde tu backend (NestJS)
  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      // Reemplazar con la llamada real a la API de tu backend
      // const response = await fetch('/api/users/me');
      // const data = await response.json();
      // set({ user: data, isLoading: false });
    } catch (error) {
      set({ error: 'Error al obtener el perfil de la base de datos', isLoading: false });
    }
  },

  // Acción pura que usamos en el Profile.tsx
  updateUsername: async (newName: string) => {
    try {
      // 1. Aquí harías el PATCH a tu backend
      // await fetch('/api/users/me', { method: 'PATCH', body: JSON.stringify({ name: newName }) });
      
      // 2. Zustand actualiza la UI al instante inyectando el nuevo nombre
      set((state) => ({
        user: state.user ? { ...state.user, name: newName } : null
      }));
    } catch (error) {
      console.error("Fallo al actualizar el nombre:", error);
      // Aquí podrías manejar la reversión del estado si la API falla
    }
  }
}));
