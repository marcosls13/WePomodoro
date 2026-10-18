import { getRoom } from "../rooms/rooms.js";
import type { TypedSocket } from "./types.js";

export function registerJoinSocket(socket: TypedSocket): void {
  socket.on("room:join", async (code: string) => {
    if (typeof code !== "string") {
      console.warn("bad event");
      return;
    }
    const room = getRoom(code);
    if (!room) {
      console.warn("room not found");
      return;
    }
    if (socket.data.code) {
      await socket.leave(socket.data.code);
    }
    await socket.join(room.code);
    socket.data.code = room.code;
    console.log(socket.id, " joined ", room.code);
  });
}
