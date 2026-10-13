import { useState } from "react";
import { InputField } from "./InputField"
import { FormHeader } from "./FormHeader"
import { SubmitButton } from "./SubmitButton"

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
     <div className="w-full max-w-md animate-slide-up [animation-delay:150ms]">
     <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100"> 
     < FormHeader title="Join the session" subtitle="Sync your focus with the team"/>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <InputField
          id="username"
          label="Username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. fdurban-"
        />

        <InputField
          id="email"
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@student.42madrid.com"
        />
	<SubmitButton>Sign In</SubmitButton>
      </form>
     </div>
     </div>
  );
}
