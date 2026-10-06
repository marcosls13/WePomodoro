import { useState, useEffect } from "react";
import { Link } from "react-router";

export default function Timer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [running]);

  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1>{seconds}s</h1>
      <button
        className="w-full max-w-sm rounded-lg border"
        onClick={() => {
          setRunning((r) => !r);
        }}
      >
        {running ? "Pause" : "Start"}
      </button>
      <Link to="/" className="text-blue-600 underline hover:text-blue-800">
        Go back to the homepage
      </Link>
    </main>
  );
}
