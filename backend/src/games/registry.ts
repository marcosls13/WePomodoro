import type { GameVerifiers } from "./games.service.js";

// Add each implemented game's authoritative verifier here. Catalogue entries
// without a verifier remain readable, but result submission returns 501.
export const gameVerifiers: GameVerifiers = {};
