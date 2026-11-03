import { Navigate, Outlet } from "react-router-dom";
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
    <div className="flex min-h-screen font-custom">
        <main className="flex flex-grow">
          <Outlet />
        </main>
      {isRandomUser?
      <Profilebar />:
      <></>}
    </div>
  );
};
