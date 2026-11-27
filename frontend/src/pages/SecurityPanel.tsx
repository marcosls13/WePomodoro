import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, post, errMsg } from "../api";
import { useAuthStore } from "../authStore";

export default function SecurityPanel() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ enabled: boolean }>("/auth/2fa")
      .then((r) => {
        setEnabled(r.enabled);
      })
      .catch((err: unknown) => {
        setMessage(errMsg(err));
      });
  }, []);

  if (enabled === null)
    return <p className="text-gray-500">{message || "Cargando..."}</p>;

  const action = enabled ? "disable" : "enable";

  const requestCode = async () => {
    setMessage("");
    try {
      await post(`/auth/2fa/${action}/request`, { password });
      setCodeSent(true);
      setMessage("Te hemos enviado un código por email.");
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  const confirm = async () => {
    setMessage("");
    try {
      await post(`/auth/2fa/${action}`, { password, code });
      setEnabled(!enabled);
      setCodeSent(false);
      setCode("");
      setPassword("");
      setMessage(
        enabled
          ? "Verificación en dos pasos desactivada."
          : "Verificación en dos pasos activada.",
      );
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm("¿Borrar tu cuenta para siempre?")) return;
    try {
      await api("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ password }),
      });
      logout();
      void navigate("/");
    } catch (err) {
      setMessage(errMsg(err));
    }
  };

  const input =
    "w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm focus:border-red-500 focus:outline-none dark:bg-slate-900 dark:text-white dark:border-slate-700";

  return (
    <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors space-y-6">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white pb-3 border-b border-gray-100 dark:border-slate-800">
        Seguridad
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Verificación en dos pasos:{" "}
        <strong>{enabled ? "activada" : "desactivada"}</strong>
      </p>

      <input
        type="password"
        placeholder="Tu contraseña"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        className={input}
      />

      {codeSent && (
        <input
          type="text"
          placeholder="Código de 6 dígitos"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          className={input}
        />
      )}

      <div className="flex gap-3">
        <button
          onClick={() => void (codeSent ? confirm() : requestCode())}
          className="px-4 py-2 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 cursor-pointer"
        >
          {codeSent ? "Confirmar" : enabled ? "Desactivar" : "Activar"}
        </button>
        <button
          onClick={() => void deleteAccount()}
          className="px-4 py-2 rounded-full border border-red-600 text-red-600 text-sm font-semibold hover:bg-red-50 dark:hover:bg-slate-900 cursor-pointer"
        >
          Borrar cuenta
        </button>
      </div>

      {message && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
      )}
    </section>
  );
}
