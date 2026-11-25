import type { InputHTMLAttributes } from "react";

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function InputField({ label, id, ...props }: InputFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-gray-500 ml-4">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm transition-all focus:border-red-500 focus:outline-none dark:bg-slate-900 dark:text-white"
        {...props}
      />
    </div>
  );
}
