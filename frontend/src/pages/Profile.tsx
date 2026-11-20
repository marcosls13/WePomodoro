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
import { useState } from 'react';
import { useProfileStore } from '../store/profileStore'; 

export default function Profile() {
  const user = useProfileStore((state) => state.user);
  const updateUsername = useProfileStore((state) => state.updateUsername);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.name || '');

  const handleSave = async () => {
    if (draftName.trim() === '' || draftName === user?.name) {
      setIsEditing(false);
      return;
    } 
    await updateUsername(draftName);
    setIsEditing(false);
  };

  if (!user) return <div className="animate-pulse text-gray-500">Cargando perfil...</div>;

  return (
    <div className="space-y-8">
      <section className="flex items-center space-x-6">
        <div className="w-24 h-24 rounded-full bg-gray-200 border-2 border-gray-300 overflow-hidden flex-shrink-0">
          <img 
            src={user.avatarUrl || '/default-avatar.png'} 
            alt={`Avatar de ${user.name}`} 
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Información General</h1>
        </div>
      </section>

      <section className="bg-gray-50 p-6 rounded-lg border border-gray-100">
        <div className="flex flex-col space-y-4">
          
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Nombre de usuario (Login)</span>
            <span className="text-sm font-mono bg-gray-200 px-2 py-1 rounded">{user.login_42}</span>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-600">Apodo (Display Name)</span>
            
            {isEditing ? (
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-black outline-none"
                  autoFocus
                />
                <button 
                  onClick={handleSave}
                  className="px-4 py-1 bg-black text-white font-medium rounded hover:bg-gray-800 transition-colors"
                >
                  Guardar
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1 bg-gray-200 text-gray-800 font-medium rounded hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <span className="text-base font-semibold">{user.name}</span>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Editar
                </button>
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
