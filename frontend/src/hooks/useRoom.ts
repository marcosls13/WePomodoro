import { useEffect, useState } from "react";

export type RoomStatus = "loading" | "found" | "missing";

export function useRoom(code: string | undefined): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if (!code) return;
        const res = await fetch(`/api/rooms/${code}`);
        if (!cancelled) setStatus(res.ok ? "found" : "missing");
      } catch {
        if (!cancelled) setStatus("missing");
      }
    }
    void check();

    return () => {
      cancelled = true;
    };
  }, [code]);
  return status;
}
