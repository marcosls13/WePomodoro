import Chat from "./Chat";
import { useState, useEffect } from "react";
import Timer from "./Timer";
import { CYCLE_SEC, getMode } from "../lib/timer";

export default function Room() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  const mode = getMode(elapsed, elapsed % CYCLE_SEC);

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
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh p-4">
      <Timer
        elapsed={elapsed}
        running={running}
        onBegin={() => {
          setRunning(true);
        }}
      />
      <div
        className={`flex flex-col transition-all duration-1000 overflow-hidden ${mode === "focus" ? "flex-0 opacity-0" : "flex-1 mt-4 md:mt-0 md:ml-4"}`}
      >
        <Chat />
      </div>
    </main>
  );
}
