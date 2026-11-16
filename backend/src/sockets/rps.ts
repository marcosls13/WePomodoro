import {
  clearPendingPick,
  getOutcome,
  getPendingPick,
  parsePick,
  setPendingPick,
  type PendingPick,
} from "../rps/rps.js";
import type { RpsResultMessage, TypedServer, TypedSocket } from "./types.js";

function buildResult(mine: PendingPick, theirs: PendingPick): RpsResultMessage {
  return {
    yours: mine.choice,
    theirs: theirs.choice,
    opponentName: theirs.name,
    outcome: getOutcome(mine.choice, theirs.choice),
  };
}

function sendResults(io: TypedServer, a: PendingPick, b: PendingPick): void {
  io.to(a.socketId).emit("rps:result", buildResult(a, b));
  io.to(b.socketId).emit("rps:result", buildResult(b, a));
}

function dropOwnPendingPick(socket: TypedSocket): void {
  const code = socket.data.code;
  if (!code) return;
  if (getPendingPick(code)?.socketId === socket.id) clearPendingPick(code);
}

export function registerRpsSocket(io: TypedServer, socket: TypedSocket): void {
  socket.on("rps:pick", (payload) => {
    const code = socket.data.code;
    const pick = parsePick(payload);
    if (!code || !pick) {
      console.warn("bad rps pick");
      return;
    }
    const mine: PendingPick = { socketId: socket.id, ...pick };
    const theirs = getPendingPick(code);
    if (!theirs || theirs.socketId === socket.id) {
      setPendingPick(code, mine);
      socket.emit("rps:waiting");
      return;
    }
    clearPendingPick(code);
    sendResults(io, mine, theirs);
  });

  socket.on("disconnect", () => {
    dropOwnPendingPick(socket);
  });
}
