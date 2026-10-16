import Chat from "./Chat";
import Timer from "./Timer";

export default function Room() {
  return (
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh gap-4 p-4">
      <Timer />
      <Chat />
    </main>
  );
}
