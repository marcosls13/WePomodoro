import { useEffect, useState } from "react";
import { api } from "../api";

interface Stats {
  focusedSeconds: number;
  wins: number;
  losses: number;
}

export default function ActivityBoard() {
  const [raw, setRaw] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/users/me/stats").then(setRaw, () => {
      setRaw(null);
    });
  }, []);

  const stats = {
    studyHours: raw ? Math.round((raw.focusedSeconds / 3600) * 10) / 10 : 0,
    wins: raw?.wins ?? 0,
    losses: raw?.losses ?? 0,
  };

  return (
    <div className="flex flex-col w-full bg-white/90 dark:bg-slate-800 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-800 transition-colors">
      <div className="pb-6 mb-6 border-b border-gray-100 dark:border-slate-800">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          Statistics
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Your lifetime totals
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile label="Hours studied" value={stats.studyHours} unit="hours" />
        <Tile label="Minigame wins" value={stats.wins} unit="wins" accent />
        <Tile label="Minigame losses" value={stats.losses} unit="losses" />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col p-6 bg-gray-50 dark:bg-slate-950/50 border border-gray-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-4xl font-extrabold font-mono ${
            accent
              ? "text-red-600 dark:text-red-500"
              : "text-gray-900 dark:text-white"
          }`}
        >
          {value}
        </span>
        <span className="text-sm font-medium text-gray-500">{unit}</span>
      </div>
    </div>
  );
}
