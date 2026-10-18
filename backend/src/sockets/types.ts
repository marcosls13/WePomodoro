import type { DefaultEventsMap, Server, Socket } from "socket.io";

export interface SocketData {
  code?: string;
}

export type TypedServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

export type TypedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
