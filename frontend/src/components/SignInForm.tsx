import { useState } from "react";
import { useNavigate } from "react-router";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { OAuthSubmitButton } from "./OAuthSubmitButton";
import FormWrapper from "./FormWrapper";
import { GitHubIcon, GoogleIcon, FortyTwoIcon } from "./icons/Icons.tsx";
import { post, errMsg } from "../api";
import { useAuthStore, type AuthUser } from "../authStore.ts";
import { PasswordField } from "./PasswordField";
import ForgotPasswordForm from "./ForgotPasswordForm";

type LoginOk = { token: string; user: AuthUser };
type Challenge = { twoFactorRequired: true; challengeToken: string };

const oauth = (provider: "42" | "google" | "github") => {
  window.location.href = `/api/auth/oauth/${provider}`;
};

export default function SignInForm() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = challengeToken
        ? await post<LoginOk>("/auth/login/2fa", { challengeToken, code })
        : await post<LoginOk | Challenge>("/auth/login", { username, password });
      if ("twoFactorRequired" in res) {
        setChallengeToken(res.challengeToken);
        return;
      }
      setSession(res.token, res.user);
      void navigate("/create");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (forgot) return <ForgotPasswordForm onBack={() => setForgot(false)} />;

  return (
    <FormWrapper>
      <FormHeader
        title="Welcome back"
        subtitle="Log in or use your 42, Google or GitHub account"
      />
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
        {challengeToken ? (
          <InputField
            id="code"
            label="Code from your email"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
        ) : (
          <>
            <InputField
              id="username"
              label="Username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <PasswordField
              id="password"
              label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <SubmitButton>Sign In</SubmitButton>
      </form>

      <div className="flex justify-end px-2 mt-3 text-sm text-gray-500">
        <button type="button" onClick={() => setForgot(true)} className="hover:text-black dark:hover:text-white cursor-pointer">
          Forgot password?
        </button>
      </div>

      <div className="flex items-center my-5">
        <div className="flex-1 border-t border-gray-300"></div>
        <span className="mx-3 text-gray-500 text-sm">or</span>
        <div className="flex-1 border-t border-gray-300"></div>
      </div>
      <div className="flex flex-col">
        <div className="flex justify-center align-center gap-4 mb-2">
          <OAuthSubmitButton type="button" onClick={() => oauth("42")}><FortyTwoIcon /></OAuthSubmitButton>
          <OAuthSubmitButton type="button" onClick={() => oauth("google")}><GoogleIcon /></OAuthSubmitButton>
          <OAuthSubmitButton type="button" onClick={() => oauth("github")}><GitHubIcon /></OAuthSubmitButton>
        </div>
      </div>
    </FormWrapper>
  );
}
