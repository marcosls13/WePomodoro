import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { clock } from "../time";

interface Member {
  id: string;
  displayName?: string;
  isOwner: boolean;
  isGuest: boolean;
  isMe: boolean;
}

interface SessionView {
  id: string;
  name: string;
  code: string | null;
  phase: "FOCUS" | "BREAK";
  timerStatus: "IDLE" | "RUNNING" | "PAUSED";
  focusSeconds: number;
  breakSeconds: number;
  remainingSeconds: number;
  members: Member[];
}

type Action = "start" | "pause" | "resume" | "cancel";

export default function Session() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [signedIn] = useState(() => Boolean(localStorage.getItem("token")));
  const [loaded, setLoaded] = useState<{
    session: SessionView;
    at: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoaded({
        session: await api<SessionView>(`/sessions/${id}`),
        at: Date.now(),
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the session.");
    }
  }, [id]);

  // There is no push channel yet: poll, and count down locally in between.
  useEffect(() => {
    if (!signedIn) return;
    void load();
    const poll = setInterval(() => void load(), 3000);
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [signedIn, load]);

  const session = loaded?.session;
  const remaining = loaded
    ? loaded.session.timerStatus === "RUNNING"
      ? Math.max(
          0,
          loaded.session.remainingSeconds -
            Math.floor((now - loaded.at) / 1000),
        )
      : loaded.session.remainingSeconds
    : 0;
  const finished = session?.timerStatus === "RUNNING" && remaining === 0;
  // The phase ran out: the server settles it on the next read.
  useEffect(() => {
    if (finished) void load();
  }, [finished, load]);

  async function run(path: string, method = "POST", json?: unknown) {
    setError("");
    try {
      await api(`/sessions/${id}${path}`, { method, json });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function leave(path: string, method: string) {
    try {
      await api(`/sessions/${id}${path}`, { method });
      void navigate("/sessions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const length = (name: string) =>
      Number(form.get(`${name}Min`)) * 60 + Number(form.get(`${name}Sec`));
    void run("", "PATCH", {
      focusSeconds: length("focus"),
      breakSeconds: length("break"),
    });
  }

  if (!signedIn)
    return (
      <section className="section-page">
        <div className="empty-state">
          <p role="alert">You need to be signed in.</p>
          <Link className="text-link" to="/auth/login">
            Sign in →
          </Link>
        </div>
      </section>
    );

  if (!session)
    return (
      <section className="section-page">
        <div className="empty-state" role={error ? "alert" : "status"}>
          {error || "Loading the session…"}
          <p>
            <Link className="text-link" to="/sessions">
              ← Sessions
            </Link>
          </p>
        </div>
      </section>
    );

  const me = session.members.find((m) => m.isMe);
  const owner = me?.isOwner ?? false;
  const idle = session.timerStatus === "IDLE";
  const button = (label: string, action: Action) => (
    <button
      type="button"
      className="button button-small"
      onClick={() => void run(`/timer/${action}`)}
    >
      {label}
    </button>
  );
  const split = (total: number) =>
    [Math.floor(total / 60), total % 60] as const;
  const [focusMin, focusSec] = split(session.focusSeconds);
  const [breakMin, breakSec] = split(session.breakSeconds);

  return (
    <section className="section-page">
      <div className="section-heading">
        <h1>{session.name}</h1>
        <Link className="text-link" to="/sessions">
          ← Sessions
        </Link>
      </div>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      <div className="session-columns">
        <div className="signup-card">
          <div className="timer-ring">
            <span className="timer-label">
              {session.phase === "FOCUS" ? "TIME TO FOCUS" : "TIME FOR A BREAK"}
            </span>
            <span className="timer-number">{clock(remaining)}</span>
            <span className="timer-caption">
              {idle
                ? "Waiting to start"
                : session.timerStatus === "PAUSED"
                  ? "Paused"
                  : "Running"}
            </span>
          </div>
          {owner ? (
            <div className="actions">
              {idle &&
                button(
                  session.phase === "FOCUS" ? "Start focus" : "Start break",
                  "start",
                )}
              {session.timerStatus === "RUNNING" && button("Pause", "pause")}
              {session.timerStatus === "PAUSED" && button("Resume", "resume")}
              {!idle && button("Cancel phase", "cancel")}
            </div>
          ) : (
            <p className="form-description">Only the owner drives the timer.</p>
          )}
        </div>

        <div className="signup-card">
          <h2 className="signup-title">Members</h2>
          {session.code ? (
            <p className="form-description">
              Share this code to invite people: <strong>{session.code}</strong>
              {owner && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-link link-button"
                    onClick={() => void run("/code")}
                  >
                    New code
                  </button>
                </>
              )}
            </p>
          ) : (
            <p className="form-description">
              A solo timer: nobody else can join.
            </p>
          )}
          <ul className="session-list">
            {session.members.map((m) => (
              <li key={m.id}>
                <span>{m.displayName ?? "Unknown"}</span>
                {m.isMe && <span className="pill">You</span>}
                {m.isOwner && <span className="pill">Owner</span>}
                {m.isGuest && <span className="pill">Guest</span>}
                {owner && !m.isMe && (
                  <>
                    <button
                      type="button"
                      className="text-link link-button"
                      onClick={() =>
                        void run("/owner", "POST", { memberId: m.id })
                      }
                    >
                      Make owner
                    </button>
                    <button
                      type="button"
                      className="text-link link-button"
                      onClick={() => void run(`/members/${m.id}`, "DELETE")}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="button button-small"
              onClick={() => void leave("/leave", "POST")}
            >
              Leave
            </button>
            {owner && (
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  if (confirm("Delete this session for everyone?"))
                    void leave("", "DELETE");
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {owner && (
          <div className="signup-card">
            <h2 className="signup-title">Settings</h2>
            <p className="form-description">
              {idle
                ? "Changes apply to the next phase."
                : "You can change the times between phases."}
            </p>
            <form
              className="signup-form"
              onSubmit={save}
              key={`${String(session.focusSeconds)}-${String(session.breakSeconds)}`}
            >
              {(
                [
                  ["focus", "Study time", focusMin, focusSec],
                  ["break", "Break time", breakMin, breakSec],
                ] as const
              ).map(([name, label, min, sec]) => (
                <div className="signup-field" key={name}>
                  <span className="signup-label">{label}</span>
                  <div className="inline-fields">
                    <input
                      className="signup-input"
                      type="number"
                      name={`${name}Min`}
                      min={0}
                      max={240}
                      defaultValue={min}
                      disabled={!idle}
                      aria-label={`${label}, minutes`}
                    />
                    <span>min</span>
                    <input
                      className="signup-input"
                      type="number"
                      name={`${name}Sec`}
                      min={0}
                      max={59}
                      defaultValue={sec}
                      disabled={!idle}
                      aria-label={`${label}, seconds`}
                    />
                    <span>sec</span>
                  </div>
                </div>
              ))}
              <button className="button signup-button" disabled={!idle}>
                Save
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
