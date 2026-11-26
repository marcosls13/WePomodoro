import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../api";
import { useAuthStore } from "../authStore";

interface AdminUser {
  id: number;
  username: string;
  email?: string;
  role: "USER" | "ADMIN";
}
interface AdminGuest {
  id: string;
  displayName: string;
}

// Administration card inside the profile page; only rendered for admins.
export default function AdminPanel() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUser[]>("/admin/users?take=100"));
      setGuests(await api<AdminGuest[]>("/admin/guests"));
    } catch (err) {
      setError(errMsg(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (path: string, name: string) => {
    if (!window.confirm(`Delete ${name}? They are removed from their room right away.`)) return;
    setError("");
    try {
      await api(path, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Administration</h2>
        <button
          className="text-sm text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white cursor-pointer"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Connected guests ({guests.length})</h3>
        <ul className="space-y-2">
          {guests.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 p-3 dark:border-slate-700 dark:text-white"
            >
              <span>{g.displayName}</span>
              <button
                className="text-sm text-red-600 cursor-pointer"
                onClick={() => void remove(`/admin/guests/${g.id}`, g.displayName)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 overflow-x-auto">
        <h3 className="font-semibold text-gray-900 dark:text-white">Registered users ({users.length})</h3>
        <table className="w-full text-left text-sm dark:text-gray-200">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              <th className="py-2">ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-slate-700">
                <td className="py-2">{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.id !== me?.id && (
                    <button
                      className="text-red-600 cursor-pointer"
                      onClick={() => void remove(`/admin/users/${u.id}`, u.username)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
