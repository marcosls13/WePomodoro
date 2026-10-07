import { useState } from "react";
import { Link, useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Request failed (${String(res.status)})`);
        return;
      }
      // The API answers the same whether or not the address has an account.
      void navigate("/auth/reset-password", {
        state: { email: email.trim() },
      });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="signup-page">
      <div className="signup-intro">
        <p className="eyebrow">It happens to everyone</p>
        <h1>
          Forgot your <span className="accent-text">password?</span>
        </h1>
        <p className="lead">
          Tell us the email you signed up with and we&apos;ll send you a 6-digit
          code to set a new one.
        </p>
      </div>
      <div className="signup-card">
        <h2 className="signup-title">Reset your password</h2>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="signup-form"
          aria-busy={pending}
        >
          <div className="signup-field">
            <label htmlFor="email" className="signup-label">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
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
            {pending ? "Sending…" : "Send me a code"}
          </button>
          <Link className="text-link" to="/auth/login">
            Back to sign in
          </Link>
        </form>
      </div>
    </section>
  );
}
