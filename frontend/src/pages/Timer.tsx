import {
  CYCLE_SEC,
  type Mode,
  calculateRemainingTime,
  formatTime,
  getMode,
} from "../lib/timer";

const MODE_BG: Record<Mode, string> = {
  waiting: "bg-yellow-500",
  focus: "bg-red-500",
  break: "bg-green-500",
};

export default function Timer({
  elapsed,
  running,
  onBegin,
}: {
  elapsed: number;
  running: boolean;
  onBegin: () => void;
}) {
  const position = elapsed % CYCLE_SEC;
  const mode = getMode(elapsed, position);

  return (
    <div
      className={`flex flex-col items-center justify-center text-2xl gap-16 transition-colors duration-500 ${MODE_BG[mode]} flex-1 rounded-2xl`}
    >
      <h1 className="text-6xl md:text-8xl">
        {formatTime(calculateRemainingTime(position))}
      </h1>
      <button
        className={`${running ? "opacity-0 pointer-events-none" : ""} transition-opacity duration-500 rounded-lg border px-4 py-2 bg-gray-200`}
        onClick={onBegin}
      >
        Begin
      </button>
    </div>
  );
}
