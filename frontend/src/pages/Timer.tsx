import { useState, useEffect } from "react";
import { Link } from "react-router";

// const FOCUS_SEC = 50 * 60;
// const BREAK_SEC = 10 * 60;
const FOCUS_SEC = 5;
const BREAK_SEC = 2;

// TODO:
// make the timer cycle between focused and break
// change the background between cycles

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Timer() {
  const [seconds, setSeconds] = useState(FOCUS_SEC);
  const [running, setRunning] = useState(false);
  type Mode = "focus" | "break";
  const [mode, setMode] = useState<Mode>("focus");

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (seconds === 0) {
        const nextMode = mode === "focus" ? "break" : "focus";
        setMode(nextMode);
        setSeconds(nextMode === "focus" ? FOCUS_SEC : BREAK_SEC);
      } else {
        setSeconds((s) => s - 1);
      }
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [running, mode, seconds]);

  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1>{formatTime(seconds)}</h1>
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
