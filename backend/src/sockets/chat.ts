import { type Server, type Socket } from "socket.io";
import { randomUUID } from "node:crypto";

export function registerChatSocket(io: Server, socket: Socket): void {
  socket.on("chat:message", (text: string) => {
    if (typeof text !== "string") {
      console.warn("bad text type");
      return;
    }
    const msg = { id: randomUUID(), text };
    io.emit("chat:message", msg);
  });
}
