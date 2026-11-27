import { Navigate, Outlet } from "react-router";
import { useState } from "react";
import { useAuthStore } from "../authStore";
import Profilebar from "../components/Profilebar";

export const ProtectedLayout = () => {
  const [isRandomUser] = useState(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <main className="flex min-h-dvh font-custom dark:bg-slate-900">
        <Outlet />
      </main>
      {isRandomUser ? <Profilebar /> : <></>}
    </>
  );
};

// Guests have no profile, stats or friends: send them back to the room page.
export const RegisteredRoute = () => {
  const user = useAuthStore((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/create" replace />;
};
