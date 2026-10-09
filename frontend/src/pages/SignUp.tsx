import { useState } from "react";
import { Link, useNavigate } from "react-router";
import Tomato from "../Tomato";
import { useRedirectIfSignedIn } from "../useRedirectIfSignedIn";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function SignUp() {
  const navigate = useNavigate();
  const checking = useRedirectIfSignedIn();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    if (!username.trim()) {
      setError("Please enter a username.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("Password must be 8–128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
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
      void navigate("/auth/verify-email");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (checking) return null;

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
        <Tomato size={140} className="tomato-friend" />
      </div>
      <div className="signup-card">
        <p className="eyebrow">Welcome to WePomodoro</p>
        <h2 className="signup-title">Create your profile</h2>
        <p className="form-description">A name, an email, and a fresh start.</p>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="signup-form"
          aria-busy={pending}
        >
          <div className="signup-field">
            <label htmlFor="username" className="signup-label">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              placeholder="Your name here"
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
              }}
              className="signup-input"
            />
          </div>

          <div className="signup-field">
            <label htmlFor="email" className="signup-label">
              Email address
            </label>
            <input
              id="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
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
              placeholder="At least 8 characters"
              type="password"
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
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat password"
              type="password"
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
            {pending ? "Creating your profile…" : "Create profile"}
          </button>
          <Link className="text-link" to="/auth/login">
            Login
          </Link>
          <Link className="text-link" to="/auth/guest">
            Continue as Guest
          </Link>
        </form>
      </div>
    </section>
  );
}
