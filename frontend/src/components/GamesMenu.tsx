import { motion, type Variants } from "motion/react";
import { Cookie, TicTacToeIcon, Connect4 } from "./icons/Icons";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.2 } },
};

export default function GamesMenu({
  onSelectGame,
}: {
  onSelectGame: (id: string) => void;
}) {
  const games = [
    { id: "cookie", name: "Cookie Clicker", icon: <Cookie /> },
    { id: "tictactoe", name: "Tic Tac", icon: <TicTacToeIcon /> },
    { id: "connect4", name: "Conecta 4", icon: <Connect4 /> },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full h-full py-8"
    >
      {games.map((game) => (
        <motion.div key={game.id} variants={itemVariants}>
          <button
            onClick={() => onSelectGame(game.id)}
            className="group flex flex-col items-center justify-center gap-3 p-6 w-36 h-36 bg-gray-50 border border-gray-200 hover:border-red-200 rounded-2xl shadow-sm transition-all duration-200 cursor-pointer dark:bg-slate-700 dark:border-slate-900"
          >
            <div className="p-3 bg-red-600 text-red-600 rounded-xl group-hover:scale-110 transition-transform">
              {game.icon}
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-white group-hover:text-red-600">
              {game.name}
            </span>
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
}
