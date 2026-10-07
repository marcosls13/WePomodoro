import { useState } from "react";
import { Link, useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [token] = useState(() => localStorage.getItem("token"));

  async function call(path: string, body: object) {
    const res = await fetch(`${API_URL}/api/auth/verify-email${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Request failed (${String(res.status)})`);
    }
  }

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

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      await call("", { code: code.trim() });
      void navigate("/UserInfo");
    });
  }

  async function resend() {
    await run(async () => {
      await call("/resend", {});
      setInfo("A new code is on its way.");
    });
  }

  return (
    <section className="signup-page">
      <div className="signup-intro">
        <p className="eyebrow">One quick step</p>
        <h1>
          Check your <span className="accent-text">inbox.</span>
        </h1>
        <p className="lead">
          We sent a 6-digit code to the email you signed up with. Enter it to
          confirm the address is yours.
        </p>
      </div>
      <div className="signup-card">
        <h2 className="signup-title">Verify your email</h2>
        {!token ? (
          <p className="form-description">
            You need to be signed in to verify your email.{" "}
            <Link className="text-link" to="/auth/login">
              Sign in
            </Link>
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="signup-form"
            aria-busy={pending}
          >
            <div className="signup-field">
              <label htmlFor="code" className="signup-label">
                Verification code
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
              {pending ? "Checking…" : "Verify"}
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
            <Link className="text-link" to="/UserInfo">
              Skip for now
            </Link>
          </form>
        )}
      </div>
    </section>
  );
}
