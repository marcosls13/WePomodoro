import { useState } from "react";
import { InputField } from "./InputField";
import FormWrapper from "./FormWrapper";
import { PasswordField } from "./PasswordField";
import VerifyCodeForm from "./VerifyCodeForm";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";

export default function SignUpForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = await post<{ pendingToken: string }>("/auth/signup", {
        email,
        username,
        password,
      });
      setPendingToken(res.pendingToken);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (pendingToken)
    return (
      <VerifyCodeForm pendingToken={pendingToken} onCancel={() => { setPendingToken(null); }} />
    );

  return (
    <FormWrapper>
      <FormHeader title="Sign Up" subtitle="Take Advantage" />
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        <InputField
          id="username"
          label="Username"
          required
          value={username}
          onChange={(e) => { setUsername(e.target.value); }}
          placeholder="Username"
        />
        <InputField
          id="email"
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          placeholder="you@student.42madrid.com"
        />
        <PasswordField
          id="password"
          label="Password"
          required
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <SubmitButton>Sign Up</SubmitButton>
      </form>
    </FormWrapper>
  );
}
