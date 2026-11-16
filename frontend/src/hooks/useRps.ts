import { useEffect, useState } from "react";
import { socket } from "../socket";
import {
  EMPTY_SCORE,
  addOutcome,
  type Choice,
  type RpsResult,
  type Score,
} from "../lib/rps";

export type RpsStatus = "idle" | "waiting" | "result";

export function useRps() {
  const [status, setStatus] = useState<RpsStatus>("idle");
  const [result, setResult] = useState<RpsResult | null>(null);
  const [score, setScore] = useState<Score>(EMPTY_SCORE);

  useEffect(() => {
    function onWaiting() {
      setStatus("waiting");
    }
    function onResult(message: RpsResult) {
      setResult(message);
      setScore((prev) => addOutcome(prev, message.outcome));
      setStatus("result");
    }
    // The server forgets a waiting pick when its socket disconnects.
    function onDisconnect() {
      setStatus((prev) => (prev === "waiting" ? "idle" : prev));
    }
    socket.on("rps:waiting", onWaiting);
    socket.on("rps:result", onResult);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("rps:waiting", onWaiting);
      socket.off("rps:result", onResult);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  function pick(choice: Choice, name: string) {
    socket.emit("rps:pick", { choice, name });
  }

  function playAgain() {
    setStatus("idle");
  }

  return { status, result, score, pick, playAgain };
}
