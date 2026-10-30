import Chat from "../components/Chat";
import { useState, useEffect } from "react";
import Timer from "../components/Timer";
import { CYCLE_SEC, getMode } from "../lib/timer";
import { useParams } from "react-router";
import NotFound from "./NotFound";
import { useRoom } from "../hooks/useRoom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { socket } from "../socket";

interface TimerStateMessage {
  startedAt: number | null;
  serverNow: number;
}

interface TimerState {
  startedAt: number | null;
  offset: number;
}

export default function Room() {
  const [now, setNow] = useState(() => Date.now());
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const { code } = useParams();
  const status = useRoom(code);
  useRoomSocket(code);

  const startedAt = timerState?.startedAt ?? null;
  const running = startedAt !== null;
  const offset = timerState?.offset ?? 0;
  const serverNow = now + offset;
  const elapsed =
    startedAt === null
      ? 0
      : Math.max(0, Math.floor((serverNow - startedAt) / 1000));

  const mode = getMode(running, elapsed % CYCLE_SEC);

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [startedAt]);

  useEffect(() => {
    function onTimerState(message: TimerStateMessage) {
      const receivedAt = Date.now();
      setNow(receivedAt);
      setTimerState({
        startedAt: message.startedAt,
        offset: message.serverNow - receivedAt,
      });
    }
    socket.on("timer:state", onTimerState);
    return () => {
      socket.off("timer:state", onTimerState);
    };
  }, []);

  if (!code || status === "missing") return <NotFound />;
  if (status === "loading" || timerState === null) return <p>Loading...</p>;

  return (
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh p-4">
      <Timer
        elapsed={elapsed}
        running={running}
        code={code}
        onBegin={() => {
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
