import { Navigate, Outlet } from "react-router";
import { useState } from "react";
import { useAuthStore } from "../authStore";
import Profilebar from "../components/Profilebar";

export const ProtectedLayout = () => {
  const [isRandomUser, setIsRandomUser] = useState(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <main className="flex min-h-screen font-custom dark:bg-slate-900">
        <Outlet />
      </main>
      {isRandomUser ? <Profilebar /> : <></>}
    </>
  );
};
