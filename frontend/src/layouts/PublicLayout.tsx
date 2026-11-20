import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export const PublicLayout = () => {
  return (
    <div className="relative flex flex-col min-h-screen font-custom overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50/20">
      
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-red-400/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-[500px] h-[500px] bg-red-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <Navbar />
      </div>
      <main className="relative z-10 flex-grow flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};

