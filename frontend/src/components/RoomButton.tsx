import { ButtonHTMLAttributes } from "react";

interface RoomButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function RoomButton({ children, ...props }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="mt-2 rounded-full bg-red-600 px-5 py-3.5 font-bold tracking-wide text-white transition-all hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
      {...props}
    >
      {children}
    </button>
  );
}
