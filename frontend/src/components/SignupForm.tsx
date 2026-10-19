import { useState } from "react";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";

export default function SignUpForm() {
  const [name, setName] = useState("");
  const [lastname, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      setName("");
      setLastName("");
      setUsername("");
      setEmail("");
    } catch {
      // network failure
    }
  }

  return (
    <div className="w-full max-w-md animate-slide-up [animation-delay:150ms]">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <FormHeader title="Sign Up" subtitle="Take Advantage" />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <InputField
            id="name"
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Antonio"
          />
          <InputField
            id="lastname"
            label="Last Name"
            required
            value={lastname}
            onChange={(e) => setLastname(e.target.value)}
            placeholder="e.g. Pérez"
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
          <InputField
            id="password"
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <SubmitButton>Sign Up</SubmitButton>
        </form>
      </div>
    </div>
  );
}
