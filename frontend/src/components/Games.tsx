import { useState } from "react";
import { AnimatePresence } from "motion/react";
import GamesMenu from "./GamesMenu";
import GameView from "./GameView";

export default function Games() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  return (
    <div className="flex flex-2/3 flex-col h-full border border-gray-100 rounded-3xl p-6 bg-white shadow-sm relative overflow-hidden dark:bg-slate-800">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Break Room Games
          </h3>
          <p className="text-xs text-gray-500">Rest and play some games!</p>
        </div>

        {selectedGame && (
          <button
            onClick={() => {
              setSelectedGame(null);
            }}
            className="text-xs font-semibold px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors cursor-pointer"
          >
            ← Back to menu
          </button>
        )}
      </div>

      <div className="flex-grow flex items-center justify-center relative">
        <AnimatePresence mode="wait">
          {!selectedGame ? (
            <GamesMenu key="menu" onSelectGame={setSelectedGame} />
          ) : (
            <GameView key={selectedGame} gameType={selectedGame} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
