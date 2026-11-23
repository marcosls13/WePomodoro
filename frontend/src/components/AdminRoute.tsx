import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../authStore";

export const AdminRoute = () => {
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" ? <Outlet/> : <Navigate to="/" replace/>;
};