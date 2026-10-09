import { randomInt } from "node:crypto";

export interface Member {
  clientId: string;
  name: string;
}

export interface Room {
  code: string;
  startedAt: number | null;
  members: Map<string, Member>;
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
  const room: Room = { code, startedAt: null, members: new Map() };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(
  code: string,
  socketId: string,
  member: Member,
): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room) return undefined;
  room.members.set(socketId, member);
  return room;
}

export function leaveRoom(code: string, socketId: string): void {
  const key = code.toUpperCase();
  const room = rooms.get(key);
  if (!room) return;
  room.members.delete(socketId);
  if (room.members.size === 0) {
    rooms.delete(key);
  }
}

export function startRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room) return undefined;
  room.startedAt ??= Date.now();
  return room;
}
