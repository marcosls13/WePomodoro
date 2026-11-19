export const CHOICES = ["rock", "paper", "scissors"] as const;
export const MAX_NAME_LENGTH = 20;

export type Choice = (typeof CHOICES)[number];
export type Outcome = "win" | "lose" | "draw";

export interface Pick {
  choice: Choice;
  name: string;
}

export interface PendingPick extends Pick {
  socketId: string;
}

const BEATS: Record<Choice, Choice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

// One waiting player per room; the next player to pick is their opponent.
const pendingPicks = new Map<string, PendingPick>();

export function isChoice(value: unknown): value is Choice {
  return CHOICES.includes(value as Choice);
}

export function parsePlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function parsePick(value: unknown): Pick | null {
  if (typeof value !== "object" || value === null) return null;
  const { choice, name } = value as Record<string, unknown>;
  const playerName = parsePlayerName(name);
  if (!isChoice(choice) || playerName === null) return null;
  return { choice, name: playerName };
}

export function getOutcome(mine: Choice, theirs: Choice): Outcome {
  if (mine === theirs) return "draw";
  return BEATS[mine] === theirs ? "win" : "lose";
}

export function getPendingPick(code: string): PendingPick | undefined {
  return pendingPicks.get(code);
}

export function setPendingPick(code: string, pick: PendingPick): void {
  pendingPicks.set(code, pick);
}

export function clearPendingPick(code: string): void {
  pendingPicks.delete(code);
}
