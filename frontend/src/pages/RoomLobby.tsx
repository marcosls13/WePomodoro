import { useNavigate } from "react-router";
import CreatePanel, { type RoomSubmitPayload } from "../components/CreatePanel";

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function RoomLobby() {
  const navigate = useNavigate();

  const handleSubmitRoom = ({ action, value }: RoomSubmitPayload) => {
    const roomId = action === "create" ? generateRoomCode() : value;

    navigate(`/room/${roomId}`, {
      state:
        action === "create"
          ? { roomName: value, isCreator: true }
          : { isCreator: false },
    });
  };

  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
      <CreatePanel onSubmitRoom={handleSubmitRoom} />
    </div>
  );
}
