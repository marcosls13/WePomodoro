import { Link, useNavigate } from "react-router";

export default function Home() {
  const navigate = useNavigate();

  async function handleCreate() {
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) {
        alert("error");
        return;
      }
      const data = (await res.json()) as { code: string };
      alert(`Your room code is ${data.code}`);
      void navigate(`/room/${data.code}`);
    } catch {
      alert("error");
    }
  }
  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1 className="text-6xl font-bold">WePomodoro</h1>
      <div className="flex flex-col gap-16">
        <button
          onClick={() => {
            void handleCreate();
          }}
          className="rounded-lg border px-4 py-2 bg-gray-300 hover:bg-gray-400 text-center"
        >
          Create room
        </button>
        <Link
          to="/room/join"
          className="rounded-lg border px-4 py-2 bg-gray-300 hover:bg-gray-400 text-center"
        >
          Join room
        </Link>
      </div>
    </main>
  );
}
