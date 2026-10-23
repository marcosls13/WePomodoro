import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../api";

const FAILED = "The provider could not complete the sign-in. Please try again.";

const messages: Partial<Record<string, string>> = {
  state: "The sign-in expired or could not be checked. Please try again.",
  denied: "The sign-in was cancelled.",
  no_email: "That account has no usable email address.",
  email_taken:
    "That email already belongs to an account. Sign in with your password or the provider you used first.",
  failed: FAILED,
};

// Where the backend sends the browser after a provider sign-in: `?code=` is the
// one-time code to swap for a session, `?error=` says why it failed.
export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code");
  const reason = params.get("error");
  const [error, setError] = useState(() =>
    reason ? (messages[reason] ?? FAILED) : code ? "" : "No sign-in code.",
  );
  // The code works once and StrictMode runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    api<{ token: string; user: { emailVerifiedAt: string | null } }>(
      "/auth/oauth/exchange",
      { method: "POST", json: { code } },
    )
      .then((res) => {
        localStorage.setItem("token", res.token);
        // A provider that doesn't vouch for the email (42) needs the emailed code.
        void navigate(
          res.user.emailVerifiedAt ? "/UserInfo" : "/auth/verify-email",
          { replace: true },
        );
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : FAILED);
      });
  }, [code, navigate]);

  return (
    <section className="signup-page oauth-page">
      <div className="signup-card">
        <p className="eyebrow">Welcome to WePomodoro</p>
        <h2 className="signup-title">
          {error ? "Sign-in failed" : "Signing you in…"}
        </h2>
        {error && (
          <>
            <p className="signup-error" role="alert">
              {error}
            </p>
            <Link className="text-link" to="/auth/login">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
