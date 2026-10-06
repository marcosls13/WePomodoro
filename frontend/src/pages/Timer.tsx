import { useState, useEffect } from "react";
import { Link } from "react-router";

// const FOCUSED_SEC = 50 * 60;
// const BREAK_SEC = 10 * 60;
const FOCUSED_SEC = 5;
// const BREAK_SEC = 2;

// TODO:
// make the timer cycle between focused and break
// change the background between cycles

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Timer() {
  const [seconds, setSeconds] = useState(FOCUSED_SEC);
  const [running, setRunning] = useState(false);

  const isFinished = seconds === 0;
  const isRunning = running && seconds > 0;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setSeconds((s) => s - 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [isRunning]);

  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1>{formatTime(seconds)}</h1>
      {isFinished && <p className="text-3xl text-green-600">Time's up</p>}
      <div className="flex gap-16">
        <button
          className="w-48 shrink-0 rounded-lg border px-4 py-2"
          onClick={() => {
            setRunning(!isRunning);
          }}
        >
          {isRunning ? "Pause" : "Start"}
        </button>
      </div>
      <Link to="/" className="text-blue-600 underline hover:text-blue-800">
        Go back to the homepage
      </Link>
    </main>
  );
}
