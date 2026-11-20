import { useState } from "react";

export default function TimeInputControl({ label, value, onChange }) {
  
  const handleDecrement = () => {
    if (value > 1) onChange(value - 1);
  };

  const handleIncrement = () => {
    onChange(value + 1);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <div className="flex items-center border border-gray-200 rounded-full bg-gray-50 overflow-hidden shadow-sm">
        
        {/* Botón menos personalizado */}
        <button
          type="button"
          onClick={handleDecrement}
          className="px-4 py-2 text-gray-500 hover:bg-gray-200 transition-colors font-bold cursor-pointer"
        >
          -
        </button>

        {/* Input numérico sin flechas nativas */}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 text-center bg-transparent focus:outline-none text-sm font-medium text-gray-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />

        {/* Botón más personalizado */}
        <button
          type="button"
          onClick={handleIncrement}
          className="px-4 py-2 text-gray-500 hover:bg-gray-200 transition-colors font-bold cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}
