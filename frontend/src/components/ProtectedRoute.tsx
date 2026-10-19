import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../authStore";

export const ProtectedRoute = () => {
  // Selectores atómicos: si cambia el isLoading, este componente NO se re-renderiza
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    // Si no hay sesión, expulsa al usuario a la raíz o login, borrando el historial de esa vista
    return <Navigate to="/" replace />;
  }

  // Si está autenticado, renderiza la vista hija (El juego, el chat, etc.)
  return <Outlet />;
};
