import { ButtonHTMLAttributes } from "react";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function OAuthSubmitButton ({ children, ...props }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="rounded-full p-1 bg-red-600 hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30"
      {...props}
    >
      {children}
    </button>
  );
}
