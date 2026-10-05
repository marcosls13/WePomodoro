import { useState } from "react";

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.SubmitEvent) {
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
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium">
              username
            </label>
            <input
              id="username"
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
              }}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Sign up
          </button>
        </form>
      </div>
    </main>
  );
}
