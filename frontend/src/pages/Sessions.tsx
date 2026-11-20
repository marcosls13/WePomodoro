import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import { clock } from "../time";

interface Listed {
  id: string;
  name: string;
  code: string | null;
  phase: "FOCUS" | "BREAK";
  timerStatus: "IDLE" | "RUNNING" | "PAUSED";
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const seconds = (form: FormData, name: string) =>
  Number(field(form, `${name}Min`)) * 60 + Number(field(form, `${name}Sec`));

function Length({
  name,
  label,
  min,
}: {
  name: string;
  label: string;
  min: number;
}) {
  return (
    <div className="signup-field">
      <span className="signup-label">{label}</span>
      <div className="inline-fields">
        <input
          className="signup-input"
          type="number"
          name={`${name}Min`}
          min={0}
          max={240}
          defaultValue={min}
          aria-label={`${label}, minutes`}
        />
        <span>min</span>
        <input
          className="signup-input"
          type="number"
          name={`${name}Sec`}
          min={0}
          max={59}
          defaultValue={0}
          aria-label={`${label}, seconds`}
        />
        <span>sec</span>
      </div>
    </div>
  );
}

export default function Sessions() {
  const navigate = useNavigate();
  const [signedIn] = useState(() => Boolean(localStorage.getItem("token")));
  const [sessions, setSessions] = useState<Listed[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    api<Listed[]>("/sessions")
      .then(setSessions)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load sessions.");
      });
  }, [signedIn]);

  async function run(action: () => Promise<{ id: string }>) {
    setPending(true);
    setError("");
    try {
      void navigate(`/sessions/${(await action()).id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(() =>
      api<{ id: string }>("/sessions", {
        method: "POST",
        json: {
          name: field(form, "name").trim(),
          focusSeconds: seconds(form, "focus"),
          breakSeconds: seconds(form, "break"),
          solo: form.get("solo") === "on",
        },
      }),
    );
  }

  function join(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = field(new FormData(event.currentTarget), "code").trim();
    void run(() =>
      api<{ id: string }>("/sessions/join", { method: "POST", json: { code } }),
    );
  }

  if (!signedIn)
    return (
      <section className="section-page">
        <div className="empty-state">
          <p role="alert">
            Sign in, or continue as a guest, to study together.
          </p>
          <Link className="text-link" to="/auth/login">
            Sign in →
          </Link>
        </div>
      </section>
    );

  return (
    <section className="section-page">
      <div className="section-heading">
        <h1>Sessions</h1>
      </div>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      <div className="session-columns">
        <div className="signup-card">
          <h2 className="signup-title">Your sessions</h2>
          {!sessions && !error && <p className="form-description">Loading…</p>}
          {sessions?.length === 0 && (
            <p className="form-description">
              You are not in any session yet. Create one or join with a code.
            </p>
          )}
          <ul className="session-list">
            {sessions?.map((s) => (
              <li key={s.id}>
                <Link className="text-link" to={`/sessions/${s.id}`}>
                  {s.name}
                </Link>
                <span className="pill">{s.code ?? "Solo"}</span>
                <span className="pill">
                  {s.timerStatus === "IDLE"
                    ? `Next: ${s.phase === "FOCUS" ? "focus" : "break"}`
                    : s.timerStatus.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="signup-card">
          <h2 className="signup-title">Join with a code</h2>
          <form className="signup-form" onSubmit={join}>
            <input
              className="signup-input"
              name="code"
              placeholder="Session code"
              required
              maxLength={64}
              aria-label="Session code"
            />
            <button className="button signup-button" disabled={pending}>
              Join
            </button>
          </form>
        </div>

        <div className="signup-card">
          <h2 className="signup-title">New session</h2>
          <form className="signup-form" onSubmit={create}>
            <div className="signup-field">
              <label className="signup-label" htmlFor="name">
                Name
              </label>
              <input
                className="signup-input"
                id="name"
                name="name"
                required
                maxLength={100}
                defaultValue="Study session"
              />
            </div>
            <Length name="focus" label="Study time" min={25} />
            <Length name="break" label="Break time" min={5} />
            <label className="check-row">
              <input type="checkbox" name="solo" /> Just me (no code, nobody can
              join)
            </label>
            <button className="button signup-button" disabled={pending}>
              Create
            </button>
          </form>
          <p className="form-description">
            Default {clock(1500)} of study, {clock(300)} of break.
          </p>
        </div>
      </div>
    </section>
  );
}
