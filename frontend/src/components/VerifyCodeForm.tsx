import { useState } from "react";
import { useNavigate } from "react-router";
import FormWrapper from "./FormWrapper";
import { FormHeader } from "./FormHeader";
import { InputField } from "./InputField";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";
import { useAuthStore, type AuthUser } from "../authStore";

interface VerifyCodeFormProps {
  pendingToken: string;
  onCancel: () => void;
}

// Last step of a signup (also of a first sign-in with an unverified provider
// email): the 6-digit code that creates the account.
export default function VerifyCodeForm({
  pendingToken,
  onCancel,
}: VerifyCodeFormProps) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = await post<{ token: string; user: AuthUser }>(
        "/auth/signup/verify",
        {
          pendingToken,
          code,
        },
      );
      setSession(res.token, res.user);
      void navigate("/create");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function resend() {
    setError("");
    try {
      await post("/auth/signup/resend", { pendingToken });
      setInfo("A new code has been sent.");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function cancel() {
    await post("/auth/signup/cancel", { pendingToken }).catch(() => undefined);
    onCancel();
  }

  return (
    <FormWrapper>
      <FormHeader
        title="Check your email"
        subtitle="Enter the 6-digit code we sent you"
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex w-full flex-col gap-5"
      >
        <InputField
          id="code"
          label="Code"
          required
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          placeholder="123456"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        <SubmitButton>Verify</SubmitButton>
      </form>
      <div className="mt-4 flex gap-6 text-sm font-bold text-gray-500">
        <button
          type="button"
          className="hover:text-black dark:hover:text-white cursor-pointer"
          onClick={() => void resend()}
        >
          Resend code
        </button>
        <button
          type="button"
          className="hover:text-black dark:hover:text-white cursor-pointer"
          onClick={() => void cancel()}
        >
          Cancel
        </button>
      </div>
    </FormWrapper>
  );
}
