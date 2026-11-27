import { useState, type SubmitEvent } from "react";

export default function TimeConfig({
  onStartRoom,
}: {
  onStartRoom: (c: { workDuration: number; restDuration: number }) => void;
}) {
  const [workMinutes, setWorkMinutes] = useState(25);
  const [restMinutes, setRestMinutes] = useState(5);

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();

    const workDurationMs = workMinutes * 60 * 1000;
    const restDurationMs = restMinutes * 60 * 1000;

    onStartRoom({ workDuration: workDurationMs, restDuration: restDurationMs });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 p-8 bg-white rounded-3xl shadow-lg max-w-md w-full border border-gray-100 dark:bg-slate-800 dark:border-slate-900"
    >
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Configure Room
        </h2>
        <p className="text-xs text-gray-500 mt-1">Stablish time intervals</p>
      </div>

      {/* Control de Trabajo */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-700">
          Tiempo de trabajo (minutos)
        </label>
        <div className="flex items-center border border-gray-200 rounded-full bg-gray-50 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setWorkMinutes((prev) => Math.max(prev - 1, 1));
            }}
            className="px-5 py-3 text-gray-600 hover:bg-gray-200 font-bold transition-colors cursor-pointer"
          >
            -
          </button>
          <input
            type="number"
            value={workMinutes}
            onChange={(e) => {
              setWorkMinutes(Math.max(Number(e.target.value), 1));
            }}
            className="w-full text-center bg-transparent focus:outline-none text-base font-semibold text-gray-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          <button
            type="button"
            onClick={() => {
              setWorkMinutes((prev) => prev + 1);
            }}
            className="px-5 py-3 text-gray-600 hover:bg-gray-200 font-bold transition-colors cursor-pointer"
          >
            +
          </button>
        </div>
      </div>

      {/* Control de Descanso */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-700">
          Tiempo de descanso (minutos)
        </label>
        <div className="flex items-center border border-gray-200 rounded-full bg-gray-50 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setRestMinutes((prev) => Math.max(prev - 1, 1));
            }}
            className="px-5 py-3 text-gray-600 hover:bg-gray-200 font-bold transition-colors cursor-pointer"
          >
            -
          </button>
          <input
            type="number"
            value={restMinutes}
            onChange={(e) => {
              setRestMinutes(Math.max(Number(e.target.value), 1));
            }}
            className="w-full text-center bg-transparent focus:outline-none text-base font-semibold text-gray-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          <button
            type="button"
            onClick={() => {
              setRestMinutes((prev) => prev + 1);
            }}
            className="px-5 py-3 text-gray-600 hover:bg-gray-200 font-bold transition-colors cursor-pointer"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 w-full bg-red-600 text-white font-semibold py-3.5 rounded-full hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
      >
        Iniciar Sala
      </button>
    </form>
  );
}
