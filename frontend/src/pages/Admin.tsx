import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import Avatar from "../Avatar";

type Role = "USER" | "MODERATOR" | "ADMIN";
interface Row {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
  // Only admins get these.
  email?: string;
  emailVerifiedAt?: string | null;
  twoFactorEnabled?: boolean;
}

export default function Admin() {
  const [role, setRole] = useState<Role | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [fresh, setFresh] = useState({
    username: "",
    email: "",
    password: "",
    role: "USER" as Role,
  });

  const [reload, setReload] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const me = await api<{ profile: { role?: Role } }>("/auth/me");
        setRole(me.profile.role ?? "USER");
        setRows(
          await api<Row[]>(`/admin/users?take=100&q=${encodeURIComponent(q)}`),
        );
        setError("");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not reach the server.",
        );
      }
    }
    void load();
  }, [q, reload]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      setEditing(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    }
  }

  const isAdmin = role === "ADMIN";
  const patch = (id: number, json: object) =>
    run(() => api(`/admin/users/${String(id)}`, { method: "PATCH", json }));

  return (
    <section className="section-page">
      <p className="eyebrow">{role ?? "…"} area</p>
      <h1>
        User <span className="accent-text">management.</span>
      </h1>
      {role === "MODERATOR" && (
        <p className="lead">
          Read-only view: moderators don&apos;t see emails.
        </p>
      )}
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          setReload((n) => n + 1);
        }}
      >
        <input
          className="signup-input"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
      </form>

      {isAdmin && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/admin/users", { method: "POST", json: fresh });
              setFresh({ username: "", email: "", password: "", role: "USER" });
            });
          }}
        >
          <strong>Create user</strong>
          <input
            className="signup-input"
            placeholder="username"
            required
            value={fresh.username}
            onChange={(e) => {
              setFresh({ ...fresh, username: e.target.value });
            }}
          />
          <input
            className="signup-input"
            placeholder="email"
            type="email"
            required
            value={fresh.email}
            onChange={(e) => {
              setFresh({ ...fresh, email: e.target.value });
            }}
          />
          <input
            className="signup-input"
            placeholder="password (8+)"
            type="password"
            required
            value={fresh.password}
            onChange={(e) => {
              setFresh({ ...fresh, password: e.target.value });
            }}
          />
          <select
            className="signup-input"
            value={fresh.role}
            onChange={(e) => {
              setFresh({ ...fresh, role: e.target.value as Role });
            }}
          >
            <option>USER</option>
            <option>MODERATOR</option>
            <option>ADMIN</option>
          </select>
          <button className="button button-small">Create</button>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>User</th>
            {isAdmin && <th>Email</th>}
            <th>Role</th>
            {isAdmin && <th>Status</th>}
            {isAdmin && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>
                <Link className="text-link" to={`/users/${String(u.id)}`}>
                  <Avatar id={u.id} size={28} /> {u.username}
                </Link>
              </td>
              {isAdmin && <td>{u.email}</td>}
              <td>
                {isAdmin ? (
                  <select
                    value={u.role}
                    onChange={(e) => {
                      void patch(u.id, { role: e.target.value });
                    }}
                  >
                    <option>USER</option>
                    <option>MODERATOR</option>
                    <option>ADMIN</option>
                  </select>
                ) : (
                  u.role
                )}
              </td>
              {isAdmin && (
                <td>
                  {u.emailVerifiedAt ? "verified" : "unverified"}
                  {u.twoFactorEnabled && " · 2FA"}
                </td>
              )}
              {isAdmin && (
                <td className="admin-actions">
                  <button
                    className="text-link"
                    onClick={() => {
                      setEditing(u);
                      setForm({
                        username: u.username,
                        email: u.email ?? "",
                        password: "",
                      });
                    }}
                  >
                    Edit
                  </button>
                  {u.twoFactorEnabled && (
                    <button
                      className="text-link"
                      onClick={() => {
                        void run(() =>
                          api(`/admin/users/${String(u.id)}/2fa`, {
                            method: "DELETE",
                          }),
                        );
                      }}
                    >
                      Reset 2FA
                    </button>
                  )}
                  <button
                    className="text-link"
                    onClick={() => {
                      if (confirm(`Delete ${u.username} and their rooms?`))
                        void run(() =>
                          api(`/admin/users/${String(u.id)}`, {
                            method: "DELETE",
                          }),
                        );
                    }}
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            const json: Record<string, string> = {};
            if (form.username !== editing.username)
              json.username = form.username;
            if (form.email !== editing.email) json.email = form.email;
            if (form.password) json.password = form.password;
            void patch(editing.id, json);
          }}
        >
          <strong>Edit {editing.username}</strong>
          <input
            className="signup-input"
            value={form.username}
            onChange={(e) => {
              setForm({ ...form, username: e.target.value });
            }}
          />
          <input
            className="signup-input"
            type="email"
            value={form.email}
            onChange={(e) => {
              setForm({ ...form, email: e.target.value });
            }}
          />
          <input
            className="signup-input"
            type="password"
            placeholder="new password (optional)"
            value={form.password}
            onChange={(e) => {
              setForm({ ...form, password: e.target.value });
            }}
          />
          <button className="button button-small">Save</button>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setEditing(null);
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
