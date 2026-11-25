import { Link, Navigate } from "react-router";
import EntryPanel from "../components/EntryPanel";
import { useAuthStore } from "../authStore";

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/create" replace />;

  return (
    <div className="flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-24 py-12 overflow-hidden">
      <div className="flex flex-col items-center text-center lg:text-left lg:items-start max-w-2xl space-y-6">
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-tight dark:text-white">
          Your time is your <span className="text-red-600">most valuable</span>{" "}
          asset.
        </h1>
        <p className="text-lg lg:text-xl text-gray-600 font-medium dark:text-gray-300">
          Sync your peak focus cycles. Team-driven deep work, zero distractions.
        </p>

        <div className="pt-4">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-200 dark:bg-slate-800"
          >
            Sync your focus
          </Link>
        </div>
      </div>

      <div className="w-full max-w-md relative min-h-[450px] flex justify-center items-start">
        <EntryPanel />
      </div>
    </div>
  );
}
