import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import TwoFactorCard from "./TwoFactorCard";

const API_URL = import.meta.env.VITE_API_URL as string;

interface Me {
  type: "user" | "guest";
  profile: {
    username?: string;
    displayName?: string;
    email?: string;
    emailVerifiedAt?: string | null;
  };
}

export default function Me() {
  const [token] = useState(() => localStorage.getItem("token"));
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
          signal: controller.signal,
        });
        if (res.status === 401) {
          setLoadError("Your session has expired. Please sign in again.");
          return;
        }
        if (!res.ok) throw new Error();
        setMe((await res.json()) as Me);
      } catch {
        if (!controller.signal.aborted)
          setLoadError("Could not load your profile. Please try again.");
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [token]);

  // Sends a reset code to the account's email, then continues on the
  // reset page where the code is entered before choosing a new password.
  async function startPasswordChange() {
    const email = me?.profile.email;
    if (pending || !email) return;
    setError("");
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Request failed (${String(res.status)})`);
        return;
      }
      void navigate("/auth/reset-password", { state: { email } });
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Ends the session on the server (a guest's temporary identity is deleted),
  // then forgets the token locally. The token is dropped even if the request
  // fails, e.g. because the session had already expired.
  async function logout() {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    } catch {
      // Offline: still sign out locally.
    } finally {
      localStorage.removeItem("token");
      setPending(false);
    }
    void navigate("/auth/login");
  }

  if (!token || loadError)
    return (
      <section className="section-page">
        <div className="empty-state">
          <p role="alert">{loadError || "You need to be signed in."}</p>
          <Link className="text-link" to="/auth/login">
            Sign in →
          </Link>
        </div>
      </section>
    );

  if (!me)
    return (
      <section className="section-page">
        <div className="empty-state" role="status">
          Loading your profile…
        </div>
      </section>
    );

  const name = me.profile.username ?? me.profile.displayName ?? "";

  return (
    <section className="signup-page">
      <div className="signup-intro">
        <p className="eyebrow">Your profile</p>
        <h1>
          Hello, <span className="accent-text">{name}.</span>
        </h1>
        {me.type === "user" ? (
          <p className="lead">
            {me.profile.email}
            <br />
            {me.profile.emailVerifiedAt ? (
              "Email verified ✓"
            ) : (
              <>
                Email not verified yet.{" "}
                <Link className="text-link" to="/auth/verify-email">
                  Verify it →
                </Link>
              </>
            )}
          </p>
        ) : (
          <p className="lead">
            You&apos;re visiting as a guest, so there&apos;s no password to
            change.
          </p>
        )}
      </div>
      {me.type === "user" && (
        <div className="signup-card">
          <h2 className="signup-title">Password</h2>
          <p className="form-description">
            We&apos;ll email a 6-digit code to {me.profile.email} before you can
            choose a new password.
          </p>
          {error && (
            <p className="signup-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="button signup-button"
            disabled={pending}
            onClick={() => {
              void startPasswordChange();
            }}
          >
            {pending ? "Sending code…" : "Change password"}
          </button>
        </div>
      )}
      {me.type === "user" && <TwoFactorCard token={token} />}
      <div className="signup-card">
        <h2 className="signup-title">Sign out</h2>
        <p className="form-description">
          {me.type === "guest"
            ? "Signing out ends your guest session and removes your temporary identity."
            : "Signs you out on this device."}
        </p>
        <button
          type="button"
          className="button signup-button"
          disabled={pending}
          onClick={() => {
            void logout();
          }}
        >
          Log out
        </button>
      </div>
    </section>
  );
}
