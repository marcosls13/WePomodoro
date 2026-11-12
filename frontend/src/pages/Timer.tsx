import { useState, useEffect } from "react";

// const FOCUS_SEC = 50 * 60;
// const BREAK_SEC = 10 * 60;
const FOCUS_SEC = 5;
const BREAK_SEC = 2;
const CYCLE_SEC = FOCUS_SEC + BREAK_SEC;

type Mode = "waiting" | "focus" | "break";
const MODE_BG: Record<Mode, string> = {
  waiting: "bg-gray-200",
  focus: "bg-red-200",
  break: "bg-green-200",
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

function getMode(elapsed: number, position: number): Mode {
  if (elapsed === 0) return "waiting";
  if (position < FOCUS_SEC) return "focus";
  return "break";
}

export default function Timer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const position = elapsed % CYCLE_SEC;
  const mode = getMode(elapsed, position);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [running]);

  return (
    <main
      className={`flex flex-col min-h-screen items-center justify-center text-5xl gap-32 transition-colors duration-500 ${MODE_BG[mode]}`}
    >
      <h1 className="text-9xl">
        {formatTime(calculateRemainingTime(position))}
      </h1>
      <button
        className={`${running ? "opacity-0 pointer-events-none" : ""} transition-opacity duration-500 w-48 shrink-0 rounded-lg border px-4 py-2 bg-gray-200`}
        onClick={() => {
          setRunning(true);
        }}
      >
        Begin
      </button>
    </main>
  );
}
