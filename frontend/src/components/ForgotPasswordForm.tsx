import { useState } from "react";
import FormWrapper from "./FormWrapper";
import { FormHeader } from "./FormHeader";
import { InputField } from "./InputField";
import { PasswordField } from "./PasswordField";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";

type Step = "email" | "code" | "password" | "done";

// Password recovery in three steps, all in this one card: email, the emailed
// 6-digit code, then the new password. Shown inside the Sign In tab.
export default function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      if (step === "email") {
        await post("/auth/password-reset/request", { email });
        setStep("code");
      } else if (step === "code") {
        const res = await post<{ resetToken: string }>("/auth/password-reset/verify", {
          email,
          code,
        });
        setResetToken(res.resetToken);
        setStep("password");
      } else if (step === "password") {
        await post("/auth/password-reset/confirm", { resetToken, password });
        setStep("done");
      }
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="mt-4 text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white cursor-pointer"
    >
      Back to sign in
    </button>
  );

  if (step === "done")
    return (
      <FormWrapper>
        <FormHeader title="Password changed" subtitle="Sign in with your new password" />
        {back}
      </FormWrapper>
    );

  return (
    <FormWrapper>
      <FormHeader
        title={step === "password" ? "New password" : "Forgot your password?"}
        subtitle={
          step === "email"
            ? "We will email you a code"
            : step === "code"
              ? "Enter the 6-digit code we sent you"
              : "Choose a new password"
        }
      />
      <form onSubmit={(e) => void handleSubmit(e)} className="flex w-full flex-col gap-5">
        {step === "email" && (
          <InputField
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@student.42madrid.com"
          />
        )}
        {step === "code" && (
          <InputField
            id="code"
            label="Code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        )}
        {step === "password" && (
          <PasswordField
            id="new-password"
            label="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <SubmitButton>
          {step === "email" ? "Send code" : step === "code" ? "Continue" : "Save"}
        </SubmitButton>
      </form>
      {back}
    </FormWrapper>
  );
}
