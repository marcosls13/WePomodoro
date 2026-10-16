import Chat from "./Chat";
import Timer from "./Timer";

export default function Room() {
  return (
    <main className="flex flex-col md:flex-row bg-gray-200 h-dvh">
      <Timer />
      <Chat />
    </main>
  );
}
