import { useState } from "react";
import { Link, useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${String(res.status)})`);
        return;
      }
      const { token } = (await res.json()) as { token: string };
      // The API returns a bearer token; later requests send it as
      // "Authorization: Bearer <token>".
      localStorage.setItem("token", token);
      void navigate("/UserInfo");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="signup-page">
      <div className="signup-intro">
        <p className="eyebrow">Your next chapter starts here</p>
        <h1>
          A place for
          <br />
          <span className="accent-text">your focus.</span>
        </h1>
        <p className="lead">
          Join a growing community making time for meaningful work, one small
          step at a time.
        </p>
        <Link className="text-link" to="/about">
          Get to know WePomodoro →
        </Link>
      </div>
      <div className="signup-card">
        <p className="eyebrow">Welcome to WePomodoro</p>
        <h2 className="signup-title">Sign in to your profile</h2>
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

          <div className="signup-field">
            <label htmlFor="password" className="signup-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="Password"
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
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
            {pending ? "Signin in" : "Sign In"}
          </button>
          <Link className="text-link" to="/auth/signup">
            Sign Up
          </Link>
          <Link className="text-link" to="/auth/guest">
            Continue as Guest
          </Link>
        </form>
      </div>
    </section>
  );
}
