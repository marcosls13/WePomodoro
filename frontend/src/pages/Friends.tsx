import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

export type FriendStatus = "focusing" | "break" | "online" | "offline";

export interface FriendItem {
  id: string;
  username: string;
  handle: string;
  status: FriendStatus;
  activeRoomId?: string;
}

const INITIAL_FRIENDS: FriendItem[] = [
  {
    id: "1",
    username: "Carlos",
    handle: "@carlos_42",
    status: "focusing",
    activeRoomId: "POMO42",
  },
  {
    id: "2",
    username: "Lucía",
    handle: "@lucia_dev",
    status: "break",
    activeRoomId: "POMO42",
  },
  {
    id: "3",
    username: "Mateo",
    handle: "@mateo_sec",
    status: "online",
  },
  {
    id: "4",
    username: "Elena",
    handle: "@elena_ui",
    status: "offline",
  },
];

const STATUS_BADGE: Record<FriendStatus, { label: string; classes: string }> = {
  focusing: {
    label: "In focus",
    classes: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  break: {
    label: "On break",
    classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  online: {
    label: "Online",
    classes: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  offline: {
    label: "Offline",
    classes: "bg-gray-200/70 text-gray-600 dark:bg-slate-800 dark:text-gray-400",
  },
};

export default function Friends() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendItem[]>(INITIAL_FRIENDS);
  const [search, setSearch] = useState("");
  const [newFriendHandle, setNewFriendHandle] = useState("");

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        f.handle.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFriendHandle.trim();
    if (!cleaned) return;

    const formattedHandle = cleaned.startsWith("@") ? cleaned : `@${cleaned}`;
    const displayName = formattedHandle.slice(1).split("_")[0];

    setFriends((prev) => [
      {
        id: crypto.randomUUID(),
        username: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        handle: formattedHandle,
        status: "online",
      },
      ...prev,
    ]);
    setNewFriendHandle("");
  };

  const handleRemoveFriend = (id: string) => {
    setFriends((prev) => prev.filter((friend) => friend.id !== id));
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Friends
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {friends.length} {friends.length === 1 ? "friend" : "friends"} in your focus circle
          </p>
        </div>

        <form onSubmit={handleAddFriend} className="flex items-center gap-2">
          <input
            type="text"
            value={newFriendHandle}
            onChange={(e) => setNewFriendHandle(e.target.value)}
            placeholder="@username"
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

      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends by name or @handle..."
          className="w-full rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm text-gray-900 focus:border-red-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {filteredFriends.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-10 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            No friends match your filter.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200/80 rounded-3xl border border-gray-200/80 bg-white/90 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/90">
          {filteredFriends.map((friend) => {
            const badge = STATUS_BADGE[friend.status];
            return (
              <li
                key={friend.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white dark:bg-slate-800">
                    {friend.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {friend.username}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                      {friend.handle}
                      {friend.activeRoomId ? ` · Room ${friend.activeRoomId}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {friend.activeRoomId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/room/${friend.activeRoomId}`)}
                      className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      Join room
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-red-500 hover:text-red-600 dark:border-slate-700 dark:text-gray-300 dark:hover:border-red-500 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
