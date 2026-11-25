import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Room from "./Room";
import { joinRoom, leaveRoom, type RoomHandle } from "../roomClient";
import { errMsg } from "../api";

export default function RoomPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomHandle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    joinRoom(code).then(
      (joined) => {
        if (!cancelled) setRoom(joined);
      },
      (err: unknown) => {
        if (!cancelled) setError(errMsg(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code]);

  const leave = () => {
    leaveRoom(code);
    void navigate("/create");
  };

  if (error)
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-gray-700 dark:text-gray-200">{error}</p>
        <button
          onClick={() => void navigate("/create")}
          className="rounded-full bg-red-600 px-5 py-2.5 font-semibold text-white"
        >
          Back
        </button>
      </div>
    );

  if (!room)
    return <div className="animate-pulse text-gray-500 p-8">Joining room...</div>;

  return (
    <>
      <Room
        initialConfig={{
          workDuration: room.settings.focusSeconds * 1000,
          restDuration: room.settings.breakSeconds * 1000,
        }}
      />
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow-md dark:bg-slate-900">
        <span className="font-mono text-sm text-gray-900 dark:text-white">{room.code}</span>
        <button onClick={leave} className="text-sm font-semibold text-red-600">
          Leave
        </button>
      </div>
    </>
  );
}
