import { randomInt } from "node:crypto";

// TODO
// room expiry / cleanup

export interface Room {
  code: string;
  startedAt: number | null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

const rooms = new Map<string, Room>();

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function createRoom(): Room {
  let code = generateCode();
  while (rooms.has(code)) {
    code = generateCode();
  }
  const room: Room = { code, startedAt: null };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function startRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room) return undefined;
  room.startedAt ??= Date.now();
  return room;
}
