import { useEffect, useState } from "react";
import { api } from "../api";

interface Report {
  daily: { date: string; focusedSeconds: number; completedSessions: number }[];
  windowFocusedSeconds: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  averageSessionSeconds: number;
  bestDay: { date: string; focusedSeconds: number } | null;
  focusedSecondsByHour: number[];
}

const minutes = (seconds: number) => `${String(Math.round(seconds / 60))} min`;

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars">
      {values.map((value, i) => (
        <span
          key={labels[i]}
          className="bar"
          title={`${labels[i] ?? ""}: ${minutes(value)}`}
          style={{ height: `${String(Math.max(2, (value / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export default function Analytics() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Report>("/users/me/analytics?days=14")
      .then(setReport)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load analytics.");
      });
  }, []);

  return (
    <div className="signup-card">
      <h2 className="signup-title">Your focus</h2>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      {!report && !error && <p className="form-description">Loading…</p>}
      {report && (
        <>
          <p className="form-description">
            Last 14 days: {minutes(report.windowFocusedSeconds)} on{" "}
            {String(report.activeDays)} active days (all time).
          </p>
          <div className="stats-row">
            <span>
              <strong>{report.currentStreak}</strong>day streak
            </span>
            <span>
              <strong>{report.longestStreak}</strong>best streak
            </span>
            <span>
              <strong>{minutes(report.averageSessionSeconds)}</strong>per
              session
            </span>
          </div>
          <Bars
            values={report.daily.map((d) => d.focusedSeconds)}
            labels={report.daily.map((d) => d.date)}
          />
          <p className="bars-caption">Minutes per day</p>
          <Bars
            values={report.focusedSecondsByHour}
            labels={report.focusedSecondsByHour.map(
              (_, h) => `${String(h)}:00 UTC`,
            )}
          />
          <p className="bars-caption">
            Time of day (UTC)
            {report.bestDay &&
              ` · best day ${report.bestDay.date} (${minutes(report.bestDay.focusedSeconds)})`}
          </p>
        </>
      )}
    </div>
  );
}
