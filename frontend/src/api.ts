import { useAuthStore } from "./authStore";

export async function api<T = unknown>(path: string, init: RequestInit = 
    {}): Promise<T> {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";
