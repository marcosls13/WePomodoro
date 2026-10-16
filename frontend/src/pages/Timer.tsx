// const FOCUS_SEC = 50 * 60;
// const BREAK_SEC = 10 * 60;
const FOCUS_SEC = 7;
const BREAK_SEC = 5;
export const CYCLE_SEC = FOCUS_SEC + BREAK_SEC;

type Mode = "waiting" | "focus" | "break";
const MODE_BG: Record<Mode, string> = {
  waiting: "bg-yellow-500",
  focus: "bg-red-500",
  break: "bg-green-500",
};

function calculateRemainingTime(position: number): number {
  if (position < FOCUS_SEC) return FOCUS_SEC - position;
  else return CYCLE_SEC - position;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getMode(elapsed: number, position: number): Mode {
  if (elapsed === 0) return "waiting";
  if (position < FOCUS_SEC) return "focus";
  return "break";
}

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
