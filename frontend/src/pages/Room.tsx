import Chat from "../components/Chat";
import { useState, useEffect } from "react";
import Timer from "../components/Timer";
import { CYCLE_SEC, getMode } from "../lib/timer";
import { useParams } from "react-router";
import NotFound from "./NotFound";
import { useRoom } from "../hooks/useRoom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { socket } from "../socket";

export default function Room() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const { code } = useParams();
  const status = useRoom(code);
  useRoomSocket(code);

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
    function onStart(startedAt: number) {
      console.log("I got it!");
      console.log(startedAt);
    }
    socket.on("room:start", onStart);
    return () => {
      socket.off("room:start", onStart);
    };
  }, []);

  if (!code || status === "missing") return <NotFound />;
  if (status === "loading") return <p>Loading...</p>;

  return (
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh p-4">
      <Timer
        elapsed={elapsed}
        running={running}
        code={code}
        onBegin={() => {
          console.log("hey");
          setRunning(true);
          socket.emit("room:start");
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
