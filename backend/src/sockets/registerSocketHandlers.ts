import { type Server } from "socket.io";
import { registerChatSocket } from "./chat.js";

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket) => {
    console.log("user connected: ", socket.id);
    socket.on("disconnect", () => {
      console.log("user disconnected: ", socket.id);
    });
    registerChatSocket(io, socket);
  });
}
