import { expect, test, describe } from "vitest";
import { createRoom, getRoom, startRoom } from "./rooms.js";

describe("Room management", () => {
  test("createRoom", () => {
    const room = createRoom();

    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}/);
    expect(room.startedAt).toBeNull();
  });

  test("getRoom", () => {
    const room = createRoom();

    expect(getRoom(room.code)).toBe(room);
    expect(getRoom(room.code.toLowerCase())).toBe(room);
    expect(getRoom("ZZZZZZ")).toBeUndefined();
  });

  test("startRoom", () => {
    const room = createRoom();

    expect(room.startedAt).toBeNull();
    startRoom(room.code);
    expect(room.startedAt).toBeTypeOf("number");
    const timestamp = room.startedAt;
    startRoom(room.code);
    expect(room.startedAt).toBe(timestamp);

    expect(startRoom("ZZZZZZ")).toBeUndefined();
  });
});
