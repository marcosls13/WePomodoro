import type { DefaultEventsMap, Server, Socket } from "socket.io";

export interface ChatMessage {
  id: string;
  text: string;
}

export interface TimerStateMessage {
  startedAt: number | null;
  serverNow: number;
}

export interface ClientToServerEvents {
  "room:join": (code: unknown) => void;
  "room:start": () => void;
  "chat:message": (text: unknown) => void;
}

export interface ServerToClientEvents {
  "timer:state": (message: TimerStateMessage) => void;
  "chat:message": (message: ChatMessage) => void;
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
