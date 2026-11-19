// Temporary source of the player's name until user accounts are merged.
// Replace these two functions with the real username when that happens.
const STORAGE_KEY = "playerName";

export const MAX_NAME_LENGTH = 20;

export function getPlayerName(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function savePlayerName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}
