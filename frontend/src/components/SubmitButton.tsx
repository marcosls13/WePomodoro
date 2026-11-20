import { ButtonHTMLAttributes } from "react";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function SubmitButton({ children, ...props }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="mt-2 w-full rounded-full bg-red-600 px-5 py-3.5 font-bold tracking-wide text-white transition-all hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
      {...props}
    >
      {children}
    </button>
  );
}
