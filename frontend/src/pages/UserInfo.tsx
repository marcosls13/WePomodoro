import { useEffect, useState } from "react";
import { Link } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;
interface User {
  id: number;
  username: string;
}
// /api/auth/me answers for both registered users and guests.
interface Profile {
  name: string;
  email?: string;
  guest: boolean;
}

export default function UserInfo() {
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadUsers() {
      setLoading(true);
      setError("");
      try {
        const headers = {
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        };
        const [meResponse, response] = await Promise.all([
          fetch(`${API_URL}/api/auth/me`, {
            headers,
            signal: controller.signal,
          }),
          fetch(`${API_URL}/api/users`, {
            headers,
            signal: controller.signal,
          }),
        ]);
        if (meResponse.status === 401 || response.status === 401)
          throw new Error("Please sign up or log in to see your profile.");
        if (!meResponse.ok || !response.ok)
          throw new Error("Could not load the community. Please try again.");
        const current = (await meResponse.json()) as {
          type: "user" | "guest";
          profile: { username?: string; email?: string; displayName?: string };
        };
        const profile: Profile = {
          name: current.profile.username ?? current.profile.displayName ?? "",
          email: current.profile.email,
          guest: current.type === "guest",
        };
        const data: unknown = await response.json();
        if (
          !Array.isArray(data) ||
          !data.every(
            (user: unknown): user is User =>
              typeof user === "object" &&
              user !== null &&
              "id" in user &&
              "username" in user &&
              typeof user.id === "number" &&
              typeof user.username === "string",
          )
        )
          throw new Error("The server returned an unexpected response.");
        if (!controller.signal.aborted) {
          setMe(profile);
          setUsers(data);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not reach the server.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadUsers();
    return () => {
      controller.abort();
    };
  }, [attempt]);

  return (
    <section className="section-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Good company for the journey</p>
          <h1>
            Meet the <span className="accent-text">community.</span>
          </h1>
          <p className="lead">
            Every great habit starts with someone taking the first step.
          </p>
        </div>
        <Link to="/signup" className="button">
          Create your profile ↗
        </Link>
      </div>
      {loading && (
        <div className="empty-state" role="status">
          Getting everyone together…
        </div>
      )}
      {!loading && !error && me && (
        <div className="user-card">
          <span className="avatar" aria-hidden="true">
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="eyebrow">Your profile</p>
            <h2>{me.name}</h2>
            <p>{me.guest ? "Guest · expires in 24 hours" : me.email}</p>
          </div>
        </div>
      )}
      {!loading && error && (
        <div className="empty-state">
          <p role="alert">{error}</p>
          <button
            className="button button-small"
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && users.length === 0 && (
        <div className="empty-state">
          <h2>A fresh beginning</h2>
          <p>There are no profiles yet. Be the first to say hello.</p>
          <Link to="/signup" className="text-link">
            Join the community →
          </Link>
        </div>
      )}
      {!loading && !error && users.length > 0 && (
        <ul className="user-grid">
          {users.map((user) => (
            <li key={user.id} className="user-card">
              <span className="avatar" aria-hidden="true">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{user.username}</h2>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
