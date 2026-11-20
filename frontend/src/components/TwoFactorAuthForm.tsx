import { useState } from "react";
import FormWrapper from "./FormWrapper";
import { SubmitButton } from "./SubmitButton";
import { FormHeader } from "./FormHeader";

export default function TwoFactorAuthForm() {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    console.log("Código 2FA enviado:", code);
  };

  return (
    <FormWrapper>
      <section className="flex flex-col items-center justify-center w-full py-4">
        <FormHeader
          title="Two-Factor Authentication"
          subtitle="Enter the 6-digit code from your authenticator app"
        />

        <form
          onSubmit={handleSubmit}
          className="flex flex-col w-full gap-6 mt-6 items-center"
        >
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="px-4 py-3 border-2 border-black dark:border-slate-700 rounded-2xl font-mono text-center tracking-widest text-2xl focus:outline-none focus:border-red-600 w-full placeholder:font-custom dark:bg-slate-900 dark:text-white"
          />
          <div className="w-full">
            <SubmitButton>Verify Code</SubmitButton>
          </div>
        </form>

        <button
          onClick={() => console.log("Reenviar código")}
          className="mt-6 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
        >
          Didn't receive a code? Resend
        </button>
      </section>
    </FormWrapper>
  );
}
