export const CHOICES = ["rock", "paper", "scissors"] as const;

export type Choice = (typeof CHOICES)[number];
export type Outcome = "win" | "lose" | "draw";

export interface RpsResult {
  yours: Choice;
  theirs: Choice;
  opponentName: string;
  outcome: Outcome;
}

export interface Score {
  wins: number;
  losses: number;
  draws: number;
}

export const EMPTY_SCORE: Score = { wins: 0, losses: 0, draws: 0 };

export const CHOICE_LABEL: Record<Choice, string> = {
  rock: "🪨 Rock",
  paper: "📄 Paper",
  scissors: "✂️ Scissors",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  win: "You win!",
  lose: "You lose!",
  draw: "It's a draw!",
};

export function addOutcome(score: Score, outcome: Outcome): Score {
  if (outcome === "win") return { ...score, wins: score.wins + 1 };
  if (outcome === "lose") return { ...score, losses: score.losses + 1 };
  return { ...score, draws: score.draws + 1 };
}
