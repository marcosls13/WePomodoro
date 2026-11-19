import { expect, test, describe } from "vitest";
import {
  clearPendingPick,
  getOutcome,
  getPendingPick,
  isChoice,
  parsePick,
  parsePlayerName,
  setPendingPick,
} from "./rps.js";

describe("Rock paper scissors", () => {
  test("isChoice", () => {
    expect(isChoice("rock")).toBe(true);
    expect(isChoice("paper")).toBe(true);
    expect(isChoice("scissors")).toBe(true);
    expect(isChoice("lizard")).toBe(false);
    expect(isChoice(1)).toBe(false);
    expect(isChoice(undefined)).toBe(false);
  });

  test("parsePlayerName", () => {
    expect(parsePlayerName("  Ana ")).toBe("Ana");
    expect(parsePlayerName("")).toBeNull();
    expect(parsePlayerName("   ")).toBeNull();
    expect(parsePlayerName("a".repeat(21))).toBeNull();
    expect(parsePlayerName(42)).toBeNull();
  });

  test("parsePick", () => {
    expect(parsePick({ choice: "rock", name: " Ana " })).toEqual({
      choice: "rock",
      name: "Ana",
    });
    expect(parsePick({ choice: "lizard", name: "Ana" })).toBeNull();
    expect(parsePick({ choice: "rock" })).toBeNull();
    expect(parsePick("rock")).toBeNull();
    expect(parsePick(null)).toBeNull();
  });

  test("getOutcome", () => {
    expect(getOutcome("rock", "scissors")).toBe("win");
    expect(getOutcome("paper", "rock")).toBe("win");
    expect(getOutcome("scissors", "paper")).toBe("win");
    expect(getOutcome("scissors", "rock")).toBe("lose");
    expect(getOutcome("rock", "paper")).toBe("lose");
    expect(getOutcome("paper", "scissors")).toBe("lose");
    expect(getOutcome("rock", "rock")).toBe("draw");
  });

  test("pending pick", () => {
    const pick = { socketId: "socket-1", name: "Ana", choice: "rock" } as const;

    expect(getPendingPick("ROOM01")).toBeUndefined();
    setPendingPick("ROOM01", pick);
    expect(getPendingPick("ROOM01")).toEqual(pick);
    expect(getPendingPick("ROOM02")).toBeUndefined();
    clearPendingPick("ROOM01");
    expect(getPendingPick("ROOM01")).toBeUndefined();
  });
});
