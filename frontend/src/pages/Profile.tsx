import { useState } from "react";
import { useProfileStore } from "../store/profileStore";
import { InputField } from "../components/InputField";
import ActivityBoard from "../components/ActivityBoard";
import TwoFactorAuthForm from "../components/TwoFactorAuthForm";
import ConfirmEmailButton from "../components/ConfirmEmailButton";

export default function Profile() {
  const user = useProfileStore((state) => state.user);
  const updateUsername = useProfileStore((state) => state.updateUsername);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [timeZone, setTimeZone] = useState(user?.timeZone || "Europe/Madrid");

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
              src={user.avatarUrl || "/default-avatar.png"}
              alt={`Avatar de ${user.name}`}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Información de Perfil
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Login 42:{" "}
              <span className="font-mono bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">
                {user.login_42}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => console.log("Abrir selector de foto")}
          className="px-5 py-2.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm font-semibold rounded-full transition-colors cursor-pointer border border-gray-200 dark:border-slate-700"
        >
          Change Profile Picture
        </button>
      </section>
      <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-3 border-b border-gray-100 dark:border-slate-800">
          Datos Personales
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            id="firstName"
            label="FIRST NAME"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Xavi"
          />
          <InputField
            id="firstName"
            label="LAST NAME"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Hernandez"
          />
          <InputField
            id="email"
            label="EMAIL"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. xavihernandez@gmail.com"
          />
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Time Zone
            </label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="px-4 py-3 bg-gray-50 dark:bg-slate-900 border border-white dark:border-slate-800 rounded-2xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:border-red-600 transition-colors cursor-pointer"
            >
              <option value="Europe/Madrid">Europe/Madrid (GMT+1)</option>
              <option value="UTC">UTC (GMT+0)</option>
              <option value="America/New_York">America/New_York (GMT-5)</option>
            </select>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityBoard />
        <TwoFactorAuthForm />
	<ConfirmEmailButton
    email={user.email}
    isVerified={user.emailVerified}
    onConfirmEmail={async (targetEmail) => {
      // Conecta aquí tu endpoint o servicio de verificación de email
      console.log("Sending confirmation to:", targetEmail);
    }}
  />
      </div>
    </div>
  );
}
