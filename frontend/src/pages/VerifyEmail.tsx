import { useState } from "react";
import { Link, useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  // A new signup has a pendingToken and no session; a signed-in unverified user
  // (changed their email) has a token and keeps the old routes.
  const [pendingToken] = useState(() => sessionStorage.getItem("pendingToken"));
  const [token] = useState(() => localStorage.getItem("token"));
  const active = pendingToken ?? token;

  async function call(path: string, body: object) {
    const res = await fetch(
      `${API_URL}/api/auth/${pendingToken ? "signup" : "verify-email"}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingToken ? "" : (token ?? "")}`,
        },
        body: JSON.stringify(pendingToken ? { ...body, pendingToken } : body),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Request failed (${String(res.status)})`);
    }
    return res;
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
      const res = await call(pendingToken ? "/verify" : "", {
        code: code.trim(),
      });
      if (pendingToken) {
        const done = (await res.json()) as { token: string };
        sessionStorage.removeItem("pendingToken");
        localStorage.setItem("token", done.token);
      }
      void navigate("/UserInfo");
    });
  }

  // Pending signup: drop it. Signed-in unverified user: just sign out.
  async function cancel() {
    await run(async () => {
      if (pendingToken) {
        await call("/cancel", {});
        sessionStorage.removeItem("pendingToken");
      } else {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        localStorage.removeItem("token");
      }
      void navigate(pendingToken ? "/auth/signup" : "/auth/login");
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
        {!active ? (
          <p className="form-description">
            Your signup has expired.{" "}
            <Link className="text-link" to="/auth/signup">
              Sign up again
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
            <button
              type="button"
              className="text-link"
              disabled={pending}
              onClick={() => {
                void cancel();
              }}
            >
              {pendingToken ? "Cancel and go back" : "Sign out"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
