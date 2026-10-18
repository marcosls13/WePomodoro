import { useEffect, useState } from "react";

export type RoomStatus = "loading" | "found" | "missing";

export function useRoom(code: string | undefined): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>("loading");

  useEffect(() => {
    async function check() {
      try {
        if (!code) return;
        const res = await fetch(`/api/rooms/${code}`);
        setStatus(res.ok ? "found" : "missing");
      } catch {
        setStatus("missing");
      }
    }
    void check();
  }, [code]);
  return status;
}
