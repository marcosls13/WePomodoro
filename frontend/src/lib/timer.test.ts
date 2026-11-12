import { expect, test, describe } from "vitest";
import { formatTime } from "./timer";

describe("formatTime", () => {
  test("", () => {
    expect(formatTime(-1)).toBe("error");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(59)).toBe("00:59");
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(61)).toBe("01:01");
    expect(formatTime(300)).toBe("05:00");
  });
});
