// export const FOCUS_SEC = 50 * 60;
// export const BREAK_SEC = 10 * 60;
export const FOCUS_SEC = 7;
export const BREAK_SEC = 5;
export const CYCLE_SEC = FOCUS_SEC + BREAK_SEC;

export type Mode = "waiting" | "focus" | "break";

export function calculateRemainingTime(position: number): number {
  if (position < FOCUS_SEC) return FOCUS_SEC - position;
  else return CYCLE_SEC - position;
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getMode(running: boolean, position: number): Mode {
  if (!running) return "waiting";
  if (position < FOCUS_SEC) return "focus";
  return "break";
}
