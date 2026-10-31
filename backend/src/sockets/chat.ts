import { randomUUID } from "node:crypto";
import type { TypedServer, TypedSocket } from "./types.js";

export function registerChatSocket(io: TypedServer, socket: TypedSocket): void {
  socket.on("chat:message", (text: string) => {
    if (typeof text !== "string") {
      console.warn("bad text type");
      return;
    }
    if (!socket.data.code) {
      console.warn("no code in socket");
      return;
    }
    const msg = { id: randomUUID(), text };
    io.to(socket.data.code).emit("chat:message", msg);
  });
}
