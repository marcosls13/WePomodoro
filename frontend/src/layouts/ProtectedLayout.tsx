import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../authStore";
import Profilebar from "../components/Profilebar";

export const ProtectedLayout = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen font-custom">
      <Profilebar />
        <main className="flex flex-grow">
          <Outlet />
        </main>
    </div>
  );
};
