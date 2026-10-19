import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export const PublicLayout = () => {
  return (
    <div className="flex flex-col min-h-screen font-custom">
      <Navbar />
      <main className="flex-grow flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};
