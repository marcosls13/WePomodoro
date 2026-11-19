import { useState } from "react";
import { useParams } from "react-router";
import NotFound from "./NotFound";
import { useRoom } from "../hooks/useRoom";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useRps } from "../hooks/useRps";
import {
  MAX_NAME_LENGTH,
  getPlayerName,
  savePlayerName,
} from "../lib/playerName";
import {
  CHOICES,
  CHOICE_LABEL,
  OUTCOME_LABEL,
  type Choice,
  type RpsResult,
  type Score,
} from "../lib/rps";

const BUTTON =
  "rounded-lg border px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:pointer-events-none";

export default function RockPaperScissors() {
  const { code } = useParams();
  const roomStatus = useRoom(code);
  useRoomSocket(code);
  const { status, result, score, pick, playAgain } = useRps();
  const [name, setName] = useState(getPlayerName);

  function handleNameChange(nextName: string) {
    setName(nextName);
    savePlayerName(nextName);
  }

  if (!code || roomStatus === "missing") return <NotFound />;
  if (roomStatus === "loading") return <p>Loading...</p>;

  const trimmedName = name.trim();

  return (
    <main className="flex flex-col items-center gap-8 bg-gray-200 min-h-dvh p-4 py-20">
      <h1 className="text-4xl">Rock Paper Scissors</h1>
      <p>Room code: {code}</p>
      <NameForm name={name} onChange={handleNameChange} />
      {status === "idle" && (
        <ChoiceButtons
          disabled={trimmedName === ""}
          onPick={(choice) => {
            pick(choice, trimmedName);
          }}
        />
      )}
      {status === "waiting" && <p>Waiting for an opponent...</p>}
      {status === "result" && result && (
        <RoundResult result={result} onPlayAgain={playAgain} />
      )}
      <ScoreBoard score={score} />
    </main>
  );
}

function NameForm({
  name,
  onChange,
}: {
  name: string;
  onChange: (name: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      Your name
      <input
        className="rounded-lg border px-3 py-2 bg-white"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function ChoiceButtons({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (choice: Choice) => void;
}) {
  return (
    <div className="flex gap-4">
      {CHOICES.map((choice) => (
        <button
          key={choice}
          className={BUTTON}
          disabled={disabled}
          onClick={() => {
            onPick(choice);
          }}
        >
          {CHOICE_LABEL[choice]}
        </button>
      ))}
    </div>
  );
}

function RoundResult({
  result,
  onPlayAgain,
}: {
  result: RpsResult;
  onPlayAgain: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-2xl">{OUTCOME_LABEL[result.outcome]}</p>
      <p>You: {CHOICE_LABEL[result.yours]}</p>
      <p>
        {result.opponentName}: {CHOICE_LABEL[result.theirs]}
      </p>
      <button className={BUTTON} onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  );
}

function ScoreBoard({ score }: { score: Score }) {
  return (
    <p>
      Wins: {score.wins} | Losses: {score.losses} | Draws: {score.draws}
    </p>
  );
}
