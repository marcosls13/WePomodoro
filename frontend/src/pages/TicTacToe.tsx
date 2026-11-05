import { useState } from "react";

type Player = "X" | "O";
type SquareValue = Player | null;

export default function TicTacToe() {
  const [history, setHistory] = useState(() => [
    Array<SquareValue>(9).fill(null),
  ]);
  const [currentMove, setCurrentMove] = useState(0);
  const xIsNext = currentMove % 2 === 0;
  const currentSquares = history[currentMove];

  function handlePlay(nextSquares: SquareValue[]) {
    const nextHistory = [...history.slice(0, currentMove + 1), nextSquares];
    setHistory(nextHistory);
    setCurrentMove(nextHistory.length - 1);
  }

  function jumpTo(nextMove: number) {
    setCurrentMove(nextMove);
  }

  const moves = history.map((_, move) => {
    let description;
    if (move > 0) description = "Go to move #" + String(move);
    else description = "Go to game start";
    return (
      <li key={move}>
        <button
          className="bg-gray-200 border px-3 py-1 rounded-lg"
          onClick={() => {
            jumpTo(move);
          }}
        >
          {description}
        </button>
      </li>
    );
  });

  return (
    <div className="flex flex-col gap-2 items-center py-20">
      <Status squares={currentSquares} xIsNext={xIsNext} />
      <Board
        squares={currentSquares}
        xIsNext={xIsNext}
        onPlay={(squares: SquareValue[]) => {
          handlePlay(squares);
        }}
      />
      <ol className="flex flex-col gap-2">{moves}</ol>
    </div>
  );
}

export function Board({
  xIsNext,
  squares,
  onPlay,
}: {
  xIsNext: boolean;
  squares: SquareValue[];
  onPlay: (squares: SquareValue[]) => void;
}) {
  function handleSquareClick(i: number) {
    if (squares[i] || calculateWinner(squares)) return;
    const nextSquares = squares.slice();
    if (xIsNext) nextSquares[i] = "X";
    else nextSquares[i] = "O";
    onPlay(nextSquares);
  }

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2 w-72 h-72">
      {squares.map((square, i) => (
        <Square
          value={square}
          onSquareClick={() => {
            handleSquareClick(i);
          }}
          key={i}
        />
      ))}
    </div>
  );
}

export function Square({
  value,
  onSquareClick,
}: {
  value: SquareValue;
  onSquareClick: () => void;
}) {
  return (
    <button
      onClick={onSquareClick}
      className="bg-gray-200 text-4xl font-bold outline-2"
    >
      {value}
    </button>
  );
}

export function Status({
  squares,
  xIsNext,
}: {
  squares: SquareValue[];
  xIsNext: boolean;
}) {
  const winner = calculateWinner(squares);
  let status;
  if (winner) status = "Winner: " + winner;
  else status = "Next player: " + (xIsNext ? "X" : "O");

  return <div>{status}</div>;
}

function calculateWinner(squares: SquareValue[]): SquareValue {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return squares[a];
    }
  }
  return null;
}
