import { useState, useEffect } from "react";
import { Link } from "react-router";

// const FOCUS_SEC = 50 * 60;
// const BREAK_SEC = 10 * 60;
const FOCUS_SEC = 5;
const BREAK_SEC = 2;
const CYCLE_SEC = FOCUS_SEC + BREAK_SEC;

// TODO:
// change the background between modes

type Mode = "focus" | "break";

function calculateRemainingTime(position: number): number {
  if (position < FOCUS_SEC) return FOCUS_SEC - position;
  else return CYCLE_SEC - position;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Timer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const position = elapsed % CYCLE_SEC;
  const mode: Mode = position < FOCUS_SEC ? "focus" : "break";

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
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1>{formatTime(calculateRemainingTime(position))}</h1>
      {mode}
      <div className="flex gap-16">
        <button
          className="w-48 shrink-0 rounded-lg border px-4 py-2"
          onClick={() => {
            setRunning(!running);
          }}
        >
          {running ? "Pause" : "Start"}
        </button>
      </div>
      <Link to="/" className="text-blue-600 underline hover:text-blue-800">
        Go back to the homepage
      </Link>
    </main>
  );
}
