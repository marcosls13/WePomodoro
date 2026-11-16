import { expect, test, describe } from "vitest";
import { EMPTY_SCORE, addOutcome } from "./rps";

describe("addOutcome", () => {
  test("", () => {
    expect(addOutcome(EMPTY_SCORE, "win")).toEqual({
      wins: 1,
      losses: 0,
      draws: 0,
    });
    expect(addOutcome(EMPTY_SCORE, "lose")).toEqual({
      wins: 0,
      losses: 1,
      draws: 0,
    });
    expect(addOutcome(EMPTY_SCORE, "draw")).toEqual({
      wins: 0,
      losses: 0,
      draws: 1,
    });
    expect(EMPTY_SCORE).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});
