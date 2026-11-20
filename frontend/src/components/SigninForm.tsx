import { useState } from "react";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import {OAuthSubmitButton} from "./OAuthSubmitButton";
import  FormWrapper from "./FormWrapper";
import {GitHubIcon, GoogleIcon, FortyTwoIcon} from "./icons/Icons.tsx"

interface SignInFormProps {
  onSwitchMode: () => void;
}

export default function SignInForm({ onSwitchMode }: SignInFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const res = await fetch("/api/example/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email }),
      });
      if (!res.ok) {
        // TODO: show an error
        return;
      }
      setUsername("");
      setEmail("");
    } catch {
      // network failure
    }
  }

  return (
      <FormWrapper>
        <FormHeader
          title="Join the session"
          subtitle="Sync your focus with the team"
        />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <InputField
            id="username"
            label="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. fdurban-"
          />

          <InputField
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@student.42madrid.com"
          />
          <SubmitButton>Sign In</SubmitButton>
        </form>
	    <div className="flex items-center my-5">
      <div className="flex-1 border-t border-gray-300"></div>
      <span className="mx-3 text-gray-500 text-sm">or</span>
      <div className="flex-1 border-t border-gray-300"></div>
    </div>
	<div className="flex flex-col">
	<div className="flex justify-center align-center gap-4 mb-2">
      <OAuthSubmitButton><FortyTwoIcon/></OAuthSubmitButton>
      <OAuthSubmitButton><GoogleIcon/></OAuthSubmitButton>
      <OAuthSubmitButton><GitHubIcon/></OAuthSubmitButton>
      </div>
      <button
        onClick={onSwitchMode}
        className="text-sm font-bold text-gray-500 hover:text-black transition-colors"
      >
        Back
      </button>
    </div>
    </FormWrapper>
  );
}
