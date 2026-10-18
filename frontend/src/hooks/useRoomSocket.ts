import { useEffect } from "react";
import { socket } from "../socket";

export function useRoomSocket(code: string | undefined) {
  useEffect(() => {
    if (!code) return;
    function join() {
      socket.emit("room:join", code);
    }

    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
    };
  }, [code]);
}
