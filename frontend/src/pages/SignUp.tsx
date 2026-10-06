import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL as string;

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${String(res.status)})`);
        return;
      }
      setUsername("");
      setEmail("");
    } catch {
      setError("Could not reach the server");
    }
  }

  return (
    <main className="signup-page">
      <div className="signup-card">
        <h1 className="signup-title">Create your account</h1>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="signup-form"
        >
          <div className="signup-field">
            <label htmlFor="username" className="signup-label">
              username
            </label>
            <input
              id="username"
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
              email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="signup-input"
            />
          </div>
          {error && <p className="signup-error">{error}</p>}
          <button type="submit" className="signup-button">
            Sign up
          </button>
        </form>
      </div>
    </main>
  );
}
