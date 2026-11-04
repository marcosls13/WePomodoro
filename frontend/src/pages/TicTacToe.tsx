export default function TicTacToe() {
  return (
    <div className="flex justify-center items-center h-screen">
      <Board />
    </div>
  );
}

export function Square() {
  return <button className="bg-gray-200 text-4xl font-bold">X</button>;
}

export function Board() {
  return (
    <div className="grid grid-cols-3 gap-2 w-72 h-72 bg-blue-800">
      <Square />
      <Square />
      <Square />
      <Square />
      <Square />
      <Square />
      <Square />
      <Square />
      <Square />
    </div>
  );
}
