import { useState } from "react";

type Player = "X" | "O";
type SquareValue = Player | null;

export default function TicTacToe() {
  const [xIsNext, setXIsNext] = useState(true);
  const [squares, setSquares] = useState(() =>
    Array<SquareValue>(9).fill(null),
  );

  function handleClick(i: number) {
    if (squares[i] || calculateWinner(squares)) return;
    const nextSquares = squares.slice();
    if (xIsNext) nextSquares[i] = "X";
    else nextSquares[i] = "O";
    setSquares(nextSquares);
    setXIsNext(!xIsNext);
  }

  return (
    <div className="flex flex-col gap-2 justify-center items-center h-screen">
      <Status squares={squares} xIsNext={xIsNext} />
      <Board squares={squares} onSquareClick={handleClick} />
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

export function Board({
  squares,
  onSquareClick,
}: {
  squares: SquareValue[];
  onSquareClick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2 w-72 h-72">
      {squares.map((square, i) => (
        <Square
          value={square}
          onSquareClick={() => {
            onSquareClick(i);
          }}
          key={i}
        />
      ))}
    </div>
  );
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
