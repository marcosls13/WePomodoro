import { useState } from "react";

interface ConfirmEmailButtonProps {
  email: string;
  isVerified?: boolean;
  onConfirmEmail: (email: string) => Promise<void> | void;
}

export default function ConfirmEmailButton({
  email,
  isVerified = false,
  onConfirmEmail,
}: ConfirmEmailButtonProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (isVerified) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Email verified
      </span>
    );
  }

  const handleClick = async () => {
    if (status === "sending") return;
    setStatus("sending");

    try {
      await onConfirmEmail(email);
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "sending"}
        className="rounded-full bg-gray-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        {status === "sending"
          ? "Sending..."
          : status === "sent"
            ? "Resend confirmation"
            : "Confirm email"}
      </button>

      {status === "sent" && (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Verification link sent to {email}
        </span>
      )}
      {status === "error" && (
        <span className="text-xs font-medium text-red-600 dark:text-red-400">
          Could not send confirmation. Try again.
        </span>
      )}
    </div>
  );
}
