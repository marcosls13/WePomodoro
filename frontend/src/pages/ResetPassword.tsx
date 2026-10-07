import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

async function post(path: string, body: object) {
  const res = await fetch(`${API_URL}/api/auth/password-reset/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${String(res.status)})`);
  }
  return res;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const state = useLocation().state as { email?: string } | null;
  const email = state?.email ?? "";
  // Step 1 checks the emailed code; step 2 sets the new password.
  const [resetToken, setResetToken] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setError("");
    setInfo("");
    setPending(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  async function checkCode(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await post("verify", { email, code: code.trim() });
      const data = (await res.json()) as { resetToken: string };
      setResetToken(data.resetToken);
    });
  }

  async function changePassword(e: React.SubmitEvent) {
    e.preventDefault();
    if (password.length < 8 || password.length > 128) {
      setError("Password must be 8–128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    await run(async () => {
      await post("confirm", { resetToken, password });
      // Every old session was signed out; sign in with the new password.
      localStorage.removeItem("token");
      void navigate("/auth/login");
    });
  }

  async function resend() {
    await run(async () => {
      await post("request", { email });
      setInfo("If that address has an account, a new code is on its way.");
    });
  }

  if (!email)
    return (
      <section className="signup-page">
        <div className="signup-card">
          <h2 className="signup-title">Reset your password</h2>
          <p className="form-description">
            Start by telling us your email.{" "}
            <Link className="text-link" to="/auth/forgot-password">
              Request a code
            </Link>
          </p>
        </div>
      </section>
    );

  return (
    <section className="signup-page">
      <div className="signup-intro">
        <p className="eyebrow">Almost there</p>
        <h1>
          Choose a <span className="accent-text">new password.</span>
        </h1>
        <p className="lead">
          {resetToken
            ? "Your code worked. Pick a new password you'll remember."
            : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}
        </p>
      </div>
      <div className="signup-card">
        <h2 className="signup-title">
          {resetToken ? "New password" : "Enter your code"}
        </h2>
        {!resetToken ? (
          <form
            onSubmit={(e) => {
              void checkCode(e);
            }}
            className="signup-form"
            aria-busy={pending}
          >
            <div className="signup-field">
              <label htmlFor="code" className="signup-label">
                6-digit code
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                required
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                }}
                className="signup-input"
              />
            </div>
            {error && (
              <p className="signup-error" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p className="signup-success" role="status">
                {info}
              </p>
            )}
            <button
              type="submit"
              className="button signup-button"
              disabled={pending}
            >
              {pending ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              className="text-link"
              disabled={pending}
              onClick={() => {
                void resend();
              }}
            >
              Send me a new code
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              void changePassword(e);
            }}
            className="signup-form"
            aria-busy={pending}
          >
            <div className="signup-field">
              <label htmlFor="password" className="signup-label">
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                className="signup-input"
              />
            </div>
            <div className="signup-field">
              <label htmlFor="confirmPassword" className="signup-label">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                }}
                className="signup-input"
              />
            </div>
            {error && (
              <p className="signup-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="button signup-button"
              disabled={pending}
            >
              {pending ? "Saving…" : "Change password"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
