export default function ActivityBoard() {
  const stats = {
    studyHours: 48.5,
    totalGamesWon: 34,
    currentStreak: 5,
  };

  return (
    <div className="flex flex-col w-full bg-white/90 dark:bg-slate-800 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-100 dark:border-slate-800">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Activity Board
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Your progress in the room
          </p>
        </div>
        <span className="px-3 py-1 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold rounded-full">
          🔥 {stats.currentStreak} days
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col p-6 bg-gray-50 dark:bg-slate-950/50 border border-gray-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Hours studied
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-gray-900 dark:text-white font-mono">
              {stats.studyHours}
            </span>
            <span className="text-sm font-medium text-gray-500">hours</span>
          </div>
          <p className="text-xs text-gray-400 mt-4">Deepwork sessions</p>
        </div>

        <div className="flex flex-col p-6 bg-gray-50 dark:bg-slate-950/50 border border-gray-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Won Tournaments
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-red-600 dark:text-red-500 font-mono">
              {stats.totalGamesWon}
            </span>
            <span className="text-sm font-medium text-gray-500">victories</span>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Acummulated during rest time
          </p>
        </div>
      </div>
    </div>
  );
}
