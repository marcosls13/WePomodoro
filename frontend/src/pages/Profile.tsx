import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import Avatar from "../Avatar";

interface PublicProfile {
  id: number;
  username: string;
  createdAt: string;
  focusedSeconds: number;
  completedFocusSessions: number;
  friendship: {
    id: string;
    status: "PENDING" | "ACCEPTED";
    direction: "incoming" | "outgoing";
  } | null;
}
interface Me {
  type: "user" | "guest";
  profile: { id?: number };
}

export default function Profile() {
  const { id } = useParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  const [reload, setReload] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        setMe(await api<Me>("/auth/me"));
        setProfile(await api<PublicProfile>(`/users/${id ?? ""}`));
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not reach the server.",
        );
      }
    }
    void load();
  }, [id, reload]);

  async function act(path: string, method: string, json?: unknown) {
    setError("");
    try {
      await api(path, { method, json });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    }
  }

  if (!profile)
    return (
      <section className="section-page">
        <div className="empty-state" role="status">
          {error || "Loading…"}
        </div>
      </section>
    );

  const f = profile.friendship;
  const mine = me?.profile.id === profile.id;
  const canAct = me?.type === "user" && !mine;
  return (
    <section className="section-page">
      <p className="eyebrow">Profile</p>
      <div className="profile-head">
        <Avatar id={profile.id} size={120} />
        <div>
          <h1>{profile.username}</h1>
          <p className="lead">
            Member since {new Date(profile.createdAt).toLocaleDateString()}
            {mine && " · this is you"}
          </p>
        </div>
      </div>
      <div className="stats-row">
        <span>
          <strong>{String(Math.round(profile.focusedSeconds / 60))}</strong>
          minutes focused
        </span>
        <span>
          <strong>{profile.completedFocusSessions}</strong>sessions completed
        </span>
      </div>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
      {canAct && (
        <div className="actions">
          {!f && (
            <button
              className="button button-small"
              onClick={() => {
                void act("/friends", "POST", { username: profile.username });
              }}
            >
              Add friend
            </button>
          )}
          {f?.status === "PENDING" && f.direction === "incoming" && (
            <button
              className="button button-small"
              onClick={() => {
                void act(`/friends/${f.id}/accept`, "POST");
              }}
            >
              Accept friend request
            </button>
          )}
          {f && (
            <button
              className="text-link"
              onClick={() => {
                void act(`/friends/${f.id}`, "DELETE");
              }}
            >
              {f.status === "ACCEPTED"
                ? "Remove friend ✓"
                : f.direction === "incoming"
                  ? "Decline"
                  : "Cancel request"}
            </button>
          )}
        </div>
      )}
      <p>
        <Link className="text-link" to="/UserInfo">
          ← Community
        </Link>
      </p>
    </section>
  );
}
