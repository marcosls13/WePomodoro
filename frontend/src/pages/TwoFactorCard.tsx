import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL as string;

interface Status {
  enabled: boolean;
  recoveryCodesLeft: number;
}
interface Setup {
  secret: string;
  otpauthUri: string;
}
type Step = "idle" | "password" | "scan" | "codes" | "disable";

// Turn two-factor on (password → scan secret → confirm code → save recovery
// codes) or off (password + a code) for the signed-in user.
export default function TwoFactorCard({ token }: { token: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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

  function reset(next: Step) {
    setStep(next);
    setPassword("");
    setCode("");
    setError("");
  }

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  async function refresh() {
    setStatus(await call<Status>("", "GET"));
  }

  async function startSetup(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      setSetup(await call<Setup>("/setup", "POST", { password }));
      reset("scan");
    });
  }

  async function confirm(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      const result = await call<{ recoveryCodes: string[] }>(
        "/enable",
        "POST",
        { code: code.trim() },
      );
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      reset("codes");
      await refresh();
    });
  }

  async function disable(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      // A 6-digit number is an app code; anything else is a recovery code.
      const value = code.trim();
      await call("/disable", "POST", {
        password,
        ...(/^\d{6}$/.test(value) ? { code: value } : { recoveryCode: value }),
      });
      reset("idle");
      await refresh();
    });
  }

  async function newCodes(e: React.SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      const result = await call<{ recoveryCodes: string[] }>(
        "/recovery-codes",
        "POST",
        { password },
      );
      setRecoveryCodes(result.recoveryCodes);
      reset("codes");
      await refresh();
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
            ? `On. ${String(status.recoveryCodesLeft)} recovery codes left.`
            : "Off. Turn it on to ask for an authenticator code when you sign in."}
        </p>
      )}
      {error && status && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}

      {status && step === "idle" && (
        <>
          <button
            type="button"
            className="button signup-button"
            onClick={() => {
              reset(status.enabled ? "disable" : "password");
            }}
          >
            {status.enabled ? "Turn off" : "Turn on"}
          </button>
          {status.enabled && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                reset("password");
              }}
            >
              Get new recovery codes
            </button>
          )}
        </>
      )}

      {step === "password" && (
        <form
          className="signup-form"
          onSubmit={(e) => {
            void (status?.enabled ? newCodes(e) : startSetup(e));
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
            {submitting("Continue")}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              reset("idle");
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {step === "scan" && setup && (
        <form
          className="signup-form"
          onSubmit={(e) => {
            void confirm(e);
          }}
        >
          <p className="form-description">
            Scan this code with an authenticator app (Google Authenticator,
            Authy, 1Password…). It then shows a 6-digit code that changes every
            30 seconds; enter the current one below.
          </p>
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            style={{ background: "#fff", padding: 12, width: "fit-content" }}
          >
            <QRCodeSVG value={setup.otpauthUri} size={176} />
          </div>
          <p className="form-description">
            Can&apos;t scan? Enter this key in the app instead:{" "}
            <code>{setup.secret}</code>, or{" "}
            <a className="text-link" href={setup.otpauthUri}>
              open it in the app
            </a>{" "}
            if you&apos;re on your phone.
          </p>
          <div className="signup-field">
            <label htmlFor="tf-code" className="signup-label">
              6-digit code
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
            {submitting("Turn on")}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              reset("idle");
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {step === "codes" && (
        <div className="signup-form">
          <p className="form-description">
            Save these recovery codes somewhere safe. Each works once if you
            lose your app, and they won&apos;t be shown again.
          </p>
          <ul aria-label="Recovery codes">
            {recoveryCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button signup-button"
            onClick={() => {
              setRecoveryCodes([]);
              reset("idle");
            }}
          >
            I saved them
          </button>
        </div>
      )}

      {step === "disable" && (
        <form
          className="signup-form"
          onSubmit={(e) => {
            void disable(e);
          }}
        >
          <div className="signup-field">
            <label htmlFor="tf-password" className="signup-label">
              Password
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
          <div className="signup-field">
            <label htmlFor="tf-code" className="signup-label">
              Authenticator or recovery code
            </label>
            <input
              id="tf-code"
              autoComplete="one-time-code"
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
            {submitting("Turn off")}
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              reset("idle");
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
