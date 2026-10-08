import { useState } from "react";

export default function SignInForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  // Tipado estricto exigido en React
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const res = await fetch("/api/example/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email }),
      });
      if (!res.ok) {
        // TODO: show an error
        return;
      }
      setUsername("");
      setEmail("");
    } catch {
      // network failure
    }
  }

  return (
    // Diseño Pomodoro: Limpio, sombra profunda, bordes suaves
     <> 
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Join the Session</h2>
        <p className="text-sm text-gray-500 mt-1">Sync your focus with the team</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        
        <div className="flex flex-col gap-1.5">
          {/* El margen izquierdo compensa la curva del rounded-full */}
          <label htmlFor="username" className="text-sm font-semibold text-gray-700 ml-4">
            Username
          </label>
          <input
            id="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. fdurban-"
            className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm transition-all focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-gray-700 ml-4">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@student.42madrid.com"
            className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm transition-all focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>

        <button
          type="submit"
          className="mt-2 w-full rounded-full bg-red-600 px-5 py-3.5 font-bold tracking-wide text-white transition-all hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98]"
        >
          Sign In
        </button>
      </form>
      </>
  );
}
