import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useProfileStore } from "../store/profileStore";
import { useAuthStore } from "../authStore";
import { api, post, errMsg } from "../api";
import ActivityBoard from "../components/ActivityBoard";
import SecurityPanel from "./SecurityPanel";
import ConfirmEmailButton from "../components/ConfirmEmailButton";
import AdminPanel from "../components/AdminPanel";
import ChangePassword from "../components/ChangePassword";

export default function Profile() {
  const navigate = useNavigate();
  const user = useProfileStore((s) => s.user);
  const avatarVersion = useProfileStore((s) => s.avatarVersion);
  const fetchUser = useProfileStore((s) => s.fetchUser);
  const updateUsername = useProfileStore((s) => s.updateUsername);
  const bumpAvatar = useProfileStore((s) => s.bumpAvatar);
  const logout = useAuthStore((s) => s.logout);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const handleSave = async () => {
    if (draftName.trim() === "" || draftName === user?.username) {
      setIsEditing(false);
      return;
    }
    try {
      await updateUsername(draftName.trim());
      setIsEditing(false);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleAvatar = async (file: File) => {
    try {
      await api("/users/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      bumpAvatar();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const handleLogout = async () => {
    try {
      await post("/auth/logout");
    } finally {
      logout();
      void navigate("/");
    }
  };

  if (!user)
    return (
      <div className="animate-pulse text-gray-500 p-8">Cargando perfil...</div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors">
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 rounded-full bg-gray-100 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 overflow-hidden flex-shrink-0 shadow-inner">
            <img
              src={`/api/users/${String(user.id)}/avatar?v=${String(avatarVersion)}`}
              alt={`Avatar de ${user.username}`}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Información de Perfil
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {user.email}
            </p>
          </div>
        </div>
        <label className="px-5 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm font-semibold rounded-full transition-colors cursor-pointer border border-gray-200 dark:border-slate-700">
          Change Profile Picture
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatar(file);
            }}
          />
        </label>
      </section>

      <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-3 border-b border-gray-100 dark:border-slate-800">
          Datos de la cuenta
        </h2>
        <div className="flex justify-between items-center gap-4">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Nombre de usuario
          </span>
          {isEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                }}
                className="px-3 py-1 border border-gray-300 rounded-full outline-none focus:border-red-600 dark:bg-slate-900 dark:text-white dark:border-slate-700"
                autoFocus
              />
              <button
                onClick={() => void handleSave()}
                className="px-4 py-1 bg-red-600 text-white font-medium rounded-full hover:bg-red-700 transition-colors cursor-pointer"
              >
                Guardar
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                }}
                className="px-4 py-1 bg-gray-200 text-gray-800 font-medium rounded-full hover:bg-gray-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {user.username}
              </span>
              <button
                onClick={() => {
                  setDraftName(user.username);
                  setIsEditing(true);
                }}
                className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors cursor-pointer"
              >
                Editar
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>

      <ConfirmEmailButton
        email={user.email}
        isVerified={Boolean(user.emailVerifiedAt)}
        onVerified={() => void fetchUser()}
      />

      <ActivityBoard />

      <ChangePassword />

      <SecurityPanel />

      {user.role === "ADMIN" && <AdminPanel />}

      <button
        onClick={() => void handleLogout()}
        className="px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors cursor-pointer dark:bg-slate-800"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
