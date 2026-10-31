import { getRoom, startRoom } from "../rooms/rooms.js";
import type { TypedServer, TypedSocket } from "./types.js";

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
    socket.emit("timer:state", {
      startedAt: room.startedAt,
      serverNow: Date.now(),
    });
    console.log(socket.id, "joined", room.code);
  });
}

export function registerStartSocket(
  io: TypedServer,
  socket: TypedSocket,
): void {
  socket.on("room:start", () => {
    if (typeof socket.data.code !== "string") {
      console.warn("bad socket code");
      return;
    }
    const room = startRoom(socket.data.code);
    if (!room) {
      console.warn("could not start room");
      return;
    }
    io.to(room.code).emit("timer:state", {
      startedAt: room.startedAt,
      serverNow: Date.now(),
    });
  });
}
