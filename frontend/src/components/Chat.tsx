import { useState } from "react";

export default function Chat() {
  // Estado inicial con un mensaje de bienvenida del sistema
  const [messages, setMessages] = useState([
    { id: 1, sender: "Sistema", text: "¡Sala de enfoque iniciada con éxito!" }
  ]);
  const [inputText, setInputText] = useState("");

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: "Tú",
      text: inputText
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl p-6 border">
      
      <div className="pb-4 mb-4">
        <h3 className="text-lg font-bold text-gray-900">Room Chat</h3>
      </div>

      <div className="flex-grow overflow-y-auto space-y-4 pr-2 mb-4">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.sender === "Tú" ? "items-end" : "items-start"}`}
          >
            <span className="text-[10px] text-gray-400 mb-1 px-1">{msg.sender}</span>
            <div 
              className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${
                msg.sender === "Tú" 
                  ? "bg-red-600 text-white rounded-br-none" 
                  : "bg-gray-100 text-gray-800 rounded-bl-none"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-grow bg-gray-50 border border-gray-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors"
        />
        <button
          type="submit"
          className="bg-red-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
