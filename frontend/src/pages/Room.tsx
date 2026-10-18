import Chat from "./Chat";
import { useState, useEffect } from "react";
import Timer from "./Timer";
import { CYCLE_SEC, getMode } from "../lib/timer";
import { useParams } from "react-router";
import NotFound from "./NotFound";

export default function Room() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const { code } = useParams();
  const [status, setStatus] = useState<"loading" | "found" | "missing">(
    "loading",
  );

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

  useEffect(() => {
    async function check() {
      try {
        if (!code) return;
        const res = await fetch(`/api/rooms/${code}`);
        setStatus(res.ok ? "found" : "missing");
      } catch {
        setStatus("missing");
      }
    }
    void check();
  }, [code]);

  if (!code || status === "missing") return <NotFound />;
  if (status === "loading") return <p>Loading...</p>;

  return (
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh p-4">
      <Timer
        elapsed={elapsed}
        running={running}
        code={code}
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
