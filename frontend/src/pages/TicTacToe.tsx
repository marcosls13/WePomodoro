import { useState } from "react";

type Player = "X" | "O";
type SquareValue = Player | null;

export default function TicTacToe() {
  return (
    <div className="flex justify-center items-center h-screen">
      <Board />
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
    <button onClick={onSquareClick} className="bg-gray-200 text-4xl font-bold">
      {value}
    </button>
  );
}

export function Board() {
  const [squares, setSquares] = useState(() =>
    Array<SquareValue>(9).fill(null),
  );

  function onClick(i: number) {
    const nextSquares = squares.slice();
    nextSquares[i] = "X";
    setSquares(nextSquares);
  }

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2 w-72 h-72 bg-blue-800">
      {squares.map((square, i) => (
        <Square
          value={square}
          onSquareClick={() => {
            onClick(i);
          }}
          key={i}
        />
      ))}
    </div>
  );
}
