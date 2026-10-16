import { useEffect, useState } from "react";
import { socket } from "../socket";

export default function Chat() {
  interface ChatMessage {
    id: string;
    text: string;
  }
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    function onMessage(msg: ChatMessage) {
      setMessages((prev) => [...prev, msg]);
    }
    socket.on("chat message", onMessage);
    return () => {
      socket.off("chat message", onMessage);
    };
  }, []);
  return (
    <div className="flex flex-col max-w-2xl mx-auto bg-gray-100">
      <ul className="flex-1 overflow-y-auto flex flex-col gap-2 p-4">
        {messages.map((msg) => (
          <li
            className="self-start max-w-[80%] rounded-2xl bg-white px-4 py-2 shadow-sm wrap-break-word"
            key={msg.id}
          >
            {msg.text}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = text.trim();
          if (!trimmed) return;
          socket.emit("chat message", trimmed);
          setText("");
        }}
      >
        <input
          className="flex-1 rounded-lg border px-3 py-2"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <button type="submit" className="border rounded-lg px-3 py-2">
          Send
        </button>
      </form>
    </div>
  );
}
