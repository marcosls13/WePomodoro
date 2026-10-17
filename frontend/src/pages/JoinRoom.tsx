import { useState } from "react";
import { useNavigate } from "react-router";

export default function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/rooms/${code.trim()}`);
      if (!res.ok) {
        alert("error joining room");
        return;
      }
      const data = (await res.json()) as { code: string };
      void navigate(`/room/${data.code}`);
    } catch {
      alert("network failure");
    }
  }
  return (
    <main className="flex flex-col gap-8 min-h-screen items-center justify-center bg-gray-100">
      <h1 className="text-2xl font-bold">Join room</h1>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="code" className="text-sm font-medium">
            code
          </label>
          <input
            id="code"
            required
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
            className="border rounded px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="border rounded bg-gray-300 hover:bg-gray-400 px-4 py-2"
        >
          Join
        </button>
      </form>
    </main>
  );
}
