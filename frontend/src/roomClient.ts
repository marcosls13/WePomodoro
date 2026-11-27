// Everything the UI needs from the realtime layer. The WebSocket client built
// by your teammate replaces the body of these three functions; their
// signatures (and therefore every page) stay the same.
//
// Until then rooms only exist inside this browser tab, so creating a room and
// opening its page works, but a second person cannot join it.

export interface RoomSettings {
  focusSeconds: number;
  breakSeconds: number;
}

export interface RoomHandle {
  code: string;
  settings: RoomSettings;
}

const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const rooms = new Map<string, RoomHandle>();

/** Creates a room and returns its shareable code. */
export function createRoom(settings: RoomSettings): Promise<RoomHandle> {
  const code = Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
  const room = { code, settings };
  rooms.set(code, room);
  return Promise.resolve(room);
}

/** Joins an existing room by code (also used to join a friend's room). */
export function joinRoom(code: string): Promise<RoomHandle> {
  const room = rooms.get(code);
  return room
    ? Promise.resolve(room)
    : Promise.reject(new Error("Room not found"));
}

/** Leaves the room. The realtime layer saves the study time on its side. */
export function leaveRoom(code: string): void {
  rooms.delete(code);
}
