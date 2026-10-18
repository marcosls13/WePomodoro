import { registerChatSocket } from "./chat.js";
import { registerJoinSocket } from "./room.js";
import type { TypedServer } from "./types.js";

export function registerSocketHandlers(io: TypedServer): void {
  io.on("connection", (socket) => {
    console.log("user connected: ", socket.id);
    socket.on("disconnect", () => {
      console.log("user disconnected: ", socket.id);
    });
    registerChatSocket(io, socket);
    registerJoinSocket(socket);
  });
}
