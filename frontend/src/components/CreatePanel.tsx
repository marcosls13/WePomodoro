import { useState } from "react";
import { useNavigate } from "react-router";
import { FormHeader } from "./FormHeader";
import FormWrapper from "./FormWrapper";
import { SubmitButton } from "./SubmitButton";
import TimeInputControl from "./TimeInputControl";
import { createRoom, joinRoom, type RoomHandle } from "../roomClient";
import { errMsg } from "../api";

type PanelMode = "idle" | "create" | "join";

export default function CreatePanel() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PanelMode>("idle");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [created, setCreated] = useState<RoomHandle | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const cancel = () => {
    setMode("idle");
    setCode("");
    setError("");
  };

  const handleAction = async (target: "create" | "join") => {
    if (mode === "idle") {
      setMode(target);
      return;
    }
    if (mode !== target) return;
    setError("");
    try {
      if (target === "create") {
        setCreated(
          await createRoom({
            focusSeconds: focusMinutes * 60,
            breakSeconds: breakMinutes * 60,
          }),
        );
      } else {
        const trimmed = code.trim();
        if (!trimmed) return;
        const room = await joinRoom(trimmed);
        void navigate(`/room/${room.code}`);
      }
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.code);
    setCopied(true);
  };

  if (created)
    return (
      <div className="w-full max-w-md min-h-[450px] flex justify-center items-center">
        <FormWrapper>
          <FormHeader
            title="Room ready"
            subtitle="Share the code or start studying"
          />
          <p className="my-6 select-all text-center font-mono text-4xl tracking-widest text-gray-900 dark:text-white">
            {created.code}
          </p>
          <div className="flex flex-col gap-3">
            <SubmitButton onClick={() => void copy()}>
              {copied ? "Copied" : "Copy code"}
            </SubmitButton>
            <SubmitButton
              onClick={() => void navigate(`/room/${created.code}`)}
            >
              Start studying
            </SubmitButton>
          </div>
        </FormWrapper>
      </div>
    );

  return (
    <div className="w-full max-w-md min-h-[450px] flex justify-center items-center">
      <FormWrapper>
        <FormHeader title="Join the session" subtitle="Come on bro" />
        <div className="relative flex flex-col items-center justify-center w-full">
          {/* Create: hidden while joining */}
          <div
            className={`flex flex-col items-center w-full transition-all duration-500 ease-out overflow-hidden
            ${mode === "join" ? "max-h-0 opacity-0 pointer-events-none transform -translate-y-4" : "max-h-48 opacity-100 transform translate-y-0"}
          `}
          >
            <div
              className={`grid grid-cols-2 gap-4 transition-all duration-500 ease-out overflow-hidden w-full
              ${mode === "create" ? "max-h-20 opacity-100 mb-4 transform scale-100" : "max-h-0 opacity-0 mb-0 transform scale-95"}
            `}
            >
              <TimeInputControl
                label="Study (min)"
                value={focusMinutes}
                onChange={setFocusMinutes}
              />
              <TimeInputControl
                label="Break (min)"
                value={breakMinutes}
                onChange={setBreakMinutes}
              />
            </div>
            <SubmitButton onClick={() => void handleAction("create")}>
              Create Room
            </SubmitButton>
          </div>

          {/* Join: hidden while creating */}
          <div
            className={`flex flex-col items-center w-full transition-all duration-500 ease-out overflow-hidden
            ${mode === "create" ? "max-h-0 opacity-0 pointer-events-none transform translate-y-4" : "max-h-48 opacity-100 transform translate-y-0 mt-4"}
            ${mode === "join" && "mt-0"}
          `}
          >
            <div
              className={`transition-all duration-500 ease-out overflow-hidden flex flex-col items-center w-full
              ${mode === "join" ? "max-h-20 opacity-100 mb-4 transform scale-100" : "max-h-0 opacity-0 mb-0 transform scale-95"}
            `}
            >
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                placeholder="Room code"
                className="px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 uppercase placeholder:font-custom w-full dark:text-white"
              />
            </div>
            <SubmitButton onClick={() => void handleAction("join")}>
              Join Room
            </SubmitButton>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div
          className={`flex items-center justify-center transition-all duration-500 ease-out mt-6 ${mode !== "idle" ? "opacity-100 transform translate-y-0" : "opacity-0 pointer-events-none transform translate-y-2"}`}
        >
          <button
            onClick={cancel}
            className="text-sm font-bold text-gray-400 hover:text-black transition-colors"
          >
            Cancel
          </button>
        </div>
      </FormWrapper>
    </div>
  );
}
