import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { OAuthSubmitButton } from "./OAuthSubmitButton";
import  FormWrapper from "./FormWrapper";
import { GitHubIcon, GoogleIcon, FortyTwoIcon } from "./icons/Icons.tsx"
import { post } from "../api";
import { useAuthStore, type AuthUser } from "../authStore.ts";

interface SignInFormProps {
  onSwitchMode: () => void;
}

type LoginOk = { token: string; user: AuthUser };
type Challenge = { twoFactorRequired: true; challengeToken: string };

const oauth = (provider: "42" | "google" | "github") => {
  window.location.href = `/api/auth/oauth/${provider}`;
}

export default function SignInForm({ onSwitchMode }: SignInFormProps) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setchallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = challengeToken
        ? await post<LoginOk>("/auth/login/2fa", { challengeToken, code })
        : await post<LoginOk | Challenge>("/auth/login", { username, password });
      if ("twoFactorRequired" in res) {
        setchallengeToken(res.challengeToken);
        return;
      }
      setSession(res.token, res.user);
      void navigate("/create");
    } catch {
      setError("Wrong credentials or code");
    }
  }

  return (
      <FormWrapper>
        <FormHeader
          title="Join the session"
          subtitle="Sync your focus with the team"
        />
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          {challengeToken ? (
            <InputField id="code" label="Code from your email" required value={code}
            onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          ) : (
            <>
              <InputField id="username" label="Username" required value={username}
                onChange={(e) => setUsername(e.target.value)} />
              <InputField id="username" label="Username" required value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
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
