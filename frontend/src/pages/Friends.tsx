import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, post, errMsg } from "../api";

interface Presence {
  online: boolean;
  roomCode: string | null;
}
interface Entry {
  id: string; // friendship id
  user: { id: number; username: string };
  presence?: Presence;
}
interface FriendList {
  friends: Entry[];
  incoming: Entry[];
  outgoing: Entry[];
}

export default function Friends() {
  const navigate = useNavigate();
  const [list, setList] = useState<FriendList>({ friends: [], incoming: [], outgoing: [] });
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  // Bumping `reload` fetches the list again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const live = { on: true };
    void (async () => {
      try {
        const next = await api<FriendList>("/friends");
        if (live.on) setList(next);
      } catch (err) {
        if (live.on) setError(errMsg(err));
      }
    })();
    return () => {
      live.on = false;
    };
  }, [reload]);

  // Refreshes presence every 10 s; the WebSocket layer can push it later.
  useEffect(() => {
    const timer = setInterval(() => { setReload((n) => n + 1); }, 10000);
    return () => { clearInterval(timer); };
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      setReload((n) => n + 1);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const row = (e: Entry, actions: React.ReactNode) => (
    <li
      key={e.id}
      className="flex items-center justify-between rounded-xl bg-white p-3 shadow border border-gray-100 dark:bg-slate-800 dark:border-slate-700"
    >
      <span className="flex items-center gap-3">
        {e.presence && (
          <span
            className={`h-2.5 w-2.5 rounded-full ${e.presence.online ? "bg-green-500" : "bg-gray-300"}`}
            aria-label={e.presence.online ? "online" : "offline"}
          />
        )}
        <span className="font-semibold text-gray-900 dark:text-white">{e.user.username}</span>
        {e.presence?.roomCode && <span className="text-xs text-gray-500">in a room</span>}
      </span>
      <span className="flex gap-3 text-sm">{actions}</span>
    </li>
  );

  const remove = (e: Entry, label: string) => (
    <button className="text-red-600" onClick={() => void run(() => api(`/friends/${e.id}`, { method: "DELETE" }))}>
      {label}
    </button>
  );

  return (
    <div className="flex-grow p-6 space-y-6 dark:text-white">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Friends</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => post("/friends", { username }));
          setUsername("");
        }}
        className="flex gap-2"
      >
        <input
          value={username}
          onChange={(e) => { setUsername(e.target.value); }}
          placeholder="Add by username"
          className="rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
        />
        <button className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="font-semibold mb-2">Requests for you</h2>
        <ul className="space-y-2">
          {list.incoming.map((e) =>
            row(
              e,
              <>
                <button className="text-green-700" onClick={() => void run(() => post(`/friends/${e.id}/accept`))}>
                  Accept
                </button>
                {remove(e, "Decline")}
              </>,
            ),
          )}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Sent</h2>
        <ul className="space-y-2">{list.outgoing.map((e) => row(e, remove(e, "Cancel")))}</ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Your friends</h2>
        <ul className="space-y-2">
          {list.friends.map((e) =>
            row(
              e,
              <>
                {e.presence?.roomCode && (
                  <button
                    className="font-semibold text-red-600"
                    onClick={() => void navigate(`/room/${e.presence?.roomCode ?? ""}`)}
                  >
                    Join
                  </button>
                )}
                {remove(e, "Remove")}
              </>,
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
