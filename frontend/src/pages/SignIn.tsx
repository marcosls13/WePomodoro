import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import OAuthButtons from "../OAuthButtons";
import { useRedirectIfSignedIn } from "../useRedirectIfSignedIn";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function SignIn() {
  const navigate = useNavigate();
  const checking = useRedirectIfSignedIn();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // Set when the account has two-factor on: the password step is done and the
  // code we emailed finishes the login.
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  // Seconds until another code can be requested (each one is an email).
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const id = setTimeout(() => {
      setCooldown(cooldown - 1);
    }, 1000);
    return () => {
      clearTimeout(id);
    };
  }, [cooldown]);

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    if (challenge) {
      await finish();
      return;
    }
    if (!username.trim()) {
      setError("Please enter a username.");
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
          username: username.trim(),
          password,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${String(res.status)})`);
        return;
      }
      const body = (await res.json()) as {
        token?: string;
        twoFactorRequired?: boolean;
        challengeToken?: string;
      };
      if (body.twoFactorRequired && body.challengeToken) {
        setChallenge(body.challengeToken);
        setNotice("We emailed you a sign-in code.");
        setCooldown(30);
        return;
      }
      // The API returns a bearer token; later requests send it as
      // "Authorization: Bearer <token>".
      localStorage.setItem("token", body.token ?? "");
      void navigate("/UserInfo");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: challenge, code: code.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok || !body.token) {
        setError(body.error ?? `Request failed (${String(res.status)})`);
        // The attempt may have been cancelled after too many wrong codes.
        if (res.status === 401 && body.error?.includes("expired")) {
          setChallenge("");
          setPassword("");
          setCode("");
          setNotice("");
        }
        return;
      }
      localStorage.setItem("token", body.token);
      void navigate("/UserInfo");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (pending || cooldown) return;
    setError("");
    setNotice("");
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login/2fa/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: challenge }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${String(res.status)})`);
        // The sign-in attempt is gone; start again from the password.
        if (res.status === 401) {
          setChallenge("");
          setPassword("");
          setCode("");
        }
        return;
      }
      setCode("");
      setNotice("We emailed you a new code.");
      setCooldown(30);
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
          {challenge ? (
            <>
              <div className="signup-field">
                <label htmlFor="code" className="signup-label">
                  6-digit code from your email
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
                    setCode(e.target.value);
                  }}
                  className="signup-input"
                />
              </div>
            </>
          ) : (
            <>
              <div className="signup-field">
                <label htmlFor="username" className="signup-label">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="Username"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
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
            </>
          )}

          {notice && !error && (
            <p className="form-description" role="status">
              {notice}
            </p>
          )}
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
          {challenge && (
            <button
              type="button"
              className="text-link"
              disabled={pending || cooldown > 0}
              onClick={() => {
                void resend();
              }}
            >
              {cooldown ? `Resend code (${String(cooldown)}s)` : "Resend code"}
            </button>
          )}
          <Link className="text-link" to="/auth/forgot-password">
            Forgot your password?
          </Link>
          <Link className="text-link" to="/auth/signup">
            Sign Up
          </Link>
          <Link className="text-link" to="/auth/guest">
            Continue as Guest
          </Link>
        </form>
        {!challenge && <OAuthButtons />}
      </div>
    </section>
  );
}
