import { useEffect, useState } from "react";
import { api } from "../api";
import { duration } from "../time";

interface Stats {
  focusedSeconds: number;
  wins: number;
  losses: number;
  played: number;
}

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/users/me/stats")
      .then(setStats)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load your stats.");
      });
  }, []);

  return (
    <div className="signup-card">
      <h2 className="signup-title">Your stats</h2>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      {!stats && !error && <p className="form-description">Loading…</p>}
      {stats && (
        <div className="stats-row">
          <span>
            <strong>{duration(stats.focusedSeconds)}</strong>studied
          </span>
          <span>
            <strong>{stats.wins}</strong>wins
          </span>
          <span>
            <strong>{stats.losses}</strong>losses
          </span>
          <span>
            <strong>{stats.played}</strong>games played
          </span>
        </div>
      )}
    </div>
  );
}
