import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL as string;

interface Status {
  enabled: boolean;
}
type Action = "enable" | "disable";
type Step = "idle" | "password" | "code";

// Turn two-factor on or off for the signed-in user: password → a code emailed
// to the account → that code. Both directions use the same three steps.
export default function TwoFactorCard({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [action, setAction] = useState<Action>("enable");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  // Seconds until the code can be sent again (each send is an email).
  const [cooldown, setCooldown] = useState(0);

  const call = useCallback(
    async <T,>(path: string, method: string, body?: object): Promise<T> => {
      const res = await fetch(`${API_URL}/api/auth/2fa${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      // Enable/disable answer 204 with no body.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? `Request failed (${String(res.status)})`);
      return data as T;
    },
    [token],
  );

  useEffect(() => {
    call<Status>("", "GET")
      .then(setStatus)
      .catch(() => {
        setError("Could not load your two-factor status.");
      });
  }, [call]);

  useEffect(() => {
    if (!cooldown) return;
    const id = setTimeout(() => {
      setCooldown(cooldown - 1);
    }, 1000);
    return () => {
      clearTimeout(id);
    };
  }, [cooldown]);

  function go(next: Step) {
    setStep(next);
    setCode("");
    setError("");
    setNotice("");
    if (next === "idle") {
      setPassword("");
      setCooldown(0);
    }
  }

  async function run(work: () => Promise<void>) {
    if (pending) return;
    setError("");
    setNotice("");
    setPending(true);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  // Also used by "Resend code": the password is still in state.
  async function sendCode(e?: React.SubmitEvent) {
    e?.preventDefault();
    if (cooldown) return;
    await run(async () => {
      await call(`/${action}/request`, "POST", { password });
      setStep("code");
      setCode("");
      setNotice("We emailed you a code.");
      setCooldown(30);
    });
  }

  async function confirm(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      await call(`/${action}`, "POST", { password, code: code.trim() });
      go("idle");
      setStatus(await call<Status>("", "GET"));
    });
  }

  const submitting = (label: string) => (pending ? "Please wait…" : label);

  return (
    <div className="signup-card">
      <h2 className="signup-title">Two-factor authentication</h2>
      {!status ? (
        <p className="form-description" role="status">
          {error || "Loading…"}
        </p>
      ) : (
        <p className="form-description">
          {status.enabled
            ? "On. We email you a code when you sign in."
            : "Off. Turn it on to get a code by email when you sign in."}
        </p>
      )}
      {error && status && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-description" role="status">
          {notice}
        </p>
      )}

      {status && step === "idle" && (
        <button
          type="button"
          className="button signup-button"
          onClick={() => {
            setAction(status.enabled ? "disable" : "enable");
            go("password");
          }}
        >
          {status.enabled ? "Turn off" : "Turn on"}
        </button>
      )}

      {step === "password" && (
        <form
          className="signup-form"
          onSubmit={(e) => {
            void sendCode(e);
          }}
        >
          <div className="signup-field">
            <label htmlFor="tf-password" className="signup-label">
              Confirm your password
            </label>
            <input
              id="tf-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              className="signup-input"
            />
          </div>
          <button
            type="submit"
            className="button signup-button"
            disabled={pending}
          >
            {submitting("Send code")}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              go("idle");
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {step === "code" && (
        <form
          className="signup-form"
          onSubmit={(e) => {
            void confirm(e);
          }}
        >
          <div className="signup-field">
            <label htmlFor="tf-code" className="signup-label">
              6-digit code from your email
            </label>
            <input
              id="tf-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              className="signup-input"
            />
          </div>
          <button
            type="submit"
            className="button signup-button"
            disabled={pending}
          >
            {submitting(action === "enable" ? "Turn on" : "Turn off")}
          </button>
          <button
            type="button"
            className="text-link"
            disabled={pending || cooldown > 0}
            onClick={() => {
              void sendCode();
            }}
          >
            {cooldown ? `Resend code (${String(cooldown)}s)` : "Resend code"}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              go("idle");
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
