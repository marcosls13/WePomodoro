import type { DefaultEventsMap, Server, Socket } from "socket.io";
import type { Choice, Outcome } from "../rps/rps.js";

export interface ChatMessage {
  id: string;
  text: string;
}

export interface TimerStateMessage {
  startedAt: number | null;
  serverNow: number;
}

export interface RpsResultMessage {
  yours: Choice;
  theirs: Choice;
  opponentName: string;
  outcome: Outcome;
}

export interface ClientToServerEvents {
  "room:join": (code: unknown) => void;
  "room:start": () => void;
  "chat:message": (text: unknown) => void;
  "rps:pick": (pick: unknown) => void;
}

export interface ServerToClientEvents {
  "timer:state": (message: TimerStateMessage) => void;
  "chat:message": (message: ChatMessage) => void;
  "rps:waiting": () => void;
  "rps:result": (message: RpsResultMessage) => void;
}

export interface SocketData {
  code?: string;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
