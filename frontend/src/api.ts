import { useAuthStore } from "./authStore";
import { useNoticeStore } from "./store/noticeStore";

// Messages the backend sends when the token itself is no longer valid: the
// session expired, or an admin deleted the account or guest.
const deadToken = /session expired or invalid|valid bearer token/i;

/** Forget the identity and show the "ejected" notice. Also for the realtime layer. */
export function eject() {
  useAuthStore.getState().logout();
  useNoticeStore.getState().showEjected();
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    const message = data?.error ?? `HTTP ${String(res.status)}`;
    if (res.status === 401 && token && deadToken.test(message)) eject();
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";
