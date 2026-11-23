import { useState } from "react";
import { useNavigate } from "react-router";
import { InputField } from "./InputField";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { post, errMsg } from "../api";

export default function SignUpForm() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const { pendingToken } = await post<{ pendingToken: string }>("/auth/signup", {
        email, username, password,
      });
      void navigate("/signup/verify", {state: { pendingToken } });
    } catch {
      setError("Could not sign up (username or email might be taken)");
    }
  }

  return (
    <div className="w-full max-w-md animate-slide-up [animation-delay:150ms]">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <FormHeader title="Sign Up" subtitle="Take Advantage" />
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <InputField
            id="username"
            label="Username"
            type="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
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
