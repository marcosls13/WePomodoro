import { useEffect } from "react";
import { socket } from "../socket";

export function useRoomSocket(code: string | undefined) {
  useEffect(() => {
    if (!code) return;
    function join() {
      socket.emit("room:join", code);
    }

    socket.on("connect", join);
    if (socket.connected) join();

    return () => {
      socket.off("connect", join);
    };
  }, [code]);
}
