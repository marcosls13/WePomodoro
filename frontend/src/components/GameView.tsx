import { motion } from "motion/react";

export default function GameView({ gameType }: { gameType: string }) {
  const gameTitles: Record<string, string> = {
    cookie: "🍪 Cookie Clicker",
    tictactoe: "❌ Tres en Raya",
    connect4: "🔴 Conecta 4",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center w-full h-full bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 p-8 text-center"
    >
      <h4 className="text-lg font-bold text-gray-800 capitalize mb-2">
        {gameTitles[gameType]}
      </h4>
      <p className="text-xs text-gray-500 max-w-sm mb-6">
        Espacio reservado para integrar el componente desarrollado por tu
        equipo.
      </p>

      {/*
        {gameType === "tictactoe" && <TicTacToe />}
      */}
    </motion.div>
  );
}
