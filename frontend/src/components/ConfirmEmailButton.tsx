import { useState } from "react";
import { InputField } from "./InputField";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";

interface ConfirmEmailButtonProps {
  email: string;
  isVerified: boolean;
  onVerified: () => void;
}

// An account is unverified after its email was changed. Ask for a code, then
// confirm it; until then the backend only allows the profile and this call.
export default function ConfirmEmailButton({
  email,
  isVerified,
  onVerified,
}: ConfirmEmailButtonProps) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  if (isVerified)
    return (
      <span className="inline-flex self-start items-center rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        Email verified
      </span>
    );

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      await post("/auth/verify-email/resend");
      setSent(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      await post("/auth/verify-email", { code });
      onVerified();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors space-y-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white pb-3 border-b border-gray-100 dark:border-slate-800">
        Confirm your email
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {email} is not verified yet. Until you confirm it, most of the app is locked.
      </p>
      {sent ? (
        <form onSubmit={(e) => void confirm(e)} className="flex flex-col gap-4 max-w-sm">
          <InputField
            id="email-code"
            label="Code from your email"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <SubmitButton>Verify</SubmitButton>
          <button
            type="button"
            onClick={() => void sendCode()}
            className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white cursor-pointer"
          >
            Send a new code
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={busy}
          className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 cursor-pointer"
        >
          {busy ? "Sending..." : "Send confirmation code"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
