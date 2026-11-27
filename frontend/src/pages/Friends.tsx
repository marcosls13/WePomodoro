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
  const [list, setList] = useState<FriendList>({
    friends: [],
    incoming: [],
    outgoing: [],
  });
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
    const timer = setInterval(() => {
      setReload((n) => n + 1);
    }, 10000);
    return () => {
      clearInterval(timer);
    };
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

  const primary =
    "rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700";
  const secondary =
    "rounded-full border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-red-500 hover:text-red-600 dark:border-slate-700 dark:text-gray-300 dark:hover:border-red-500 dark:hover:text-red-400";

  const badge = (p?: Presence) => {
    if (!p) return null;
    const [label, classes] = p.roomCode
      ? ["In a room", "bg-red-500/10 text-red-600 dark:text-red-400"]
      : p.online
        ? ["Online", "bg-sky-500/10 text-sky-700 dark:text-sky-400"]
        : [
            "Offline",
            "bg-gray-200/70 text-gray-600 dark:bg-slate-800 dark:text-gray-400",
          ];
    return (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}
      >
        {label}
      </span>
    );
  };

  const row = (e: Entry, actions: React.ReactNode) => (
    <li
      key={e.id}
      className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white dark:bg-slate-700">
          {e.user.username.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-gray-900 dark:text-white">
            {e.user.username}
          </span>
          {badge(e.presence)}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </li>
  );

  const remove = (e: Entry, label: string) => (
    <button
      type="button"
      className={secondary}
      onClick={() =>
        void run(() => api(`/friends/${e.id}`, { method: "DELETE" }))
      }
    >
      {label}
    </button>
  );

  const section = (title: string, rows: React.ReactNode[], empty: string) => (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-10 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {empty}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200/80 rounded-3xl border border-gray-200/80 bg-white/90 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/90">
          {rows}
        </ul>
      )}
    </section>
  );

  return (
    <section className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Friends
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {list.friends.length}{" "}
            {list.friends.length === 1 ? "friend" : "friends"} in your focus
            circle
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => post("/friends", { username }));
            setUsername("");
          }}
          className="flex items-center gap-2"
        >
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
            placeholder="Add by username"
            className="w-44 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-red-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-full bg-gray-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-red-600 dark:hover:bg-red-500"
          >
            Add friend
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {list.incoming.length > 0 &&
        section(
          "Requests for you",
          list.incoming.map((e) =>
            row(
              e,
              <>
                <button
                  type="button"
                  className={primary}
                  onClick={() =>
                    void run(() => post(`/friends/${e.id}/accept`))
                  }
                >
                  Accept
                </button>
                {remove(e, "Decline")}
              </>,
            ),
          ),
          "",
        )}

      {list.outgoing.length > 0 &&
        section(
          "Sent",
          list.outgoing.map((e) => row(e, remove(e, "Cancel"))),
          "",
        )}

      {section(
        "Your friends",
        list.friends.map((e) =>
          row(
            e,
            <>
              {e.presence?.roomCode && (
                <button
                  type="button"
                  className={primary}
                  onClick={() =>
                    void navigate(`/room/${e.presence?.roomCode ?? ""}`)
                  }
                >
                  Join room
                </button>
              )}
              {remove(e, "Remove")}
            </>,
          ),
        ),
        "No friends yet. Add one by username.",
      )}
    </section>
  );
}
