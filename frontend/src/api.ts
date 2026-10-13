export const API_URL = import.meta.env.VITE_API_URL as string;

// `?v=` busts the 60 s cache after an upload.
export const avatarUrl = (id: number, version = 0) =>
  `${API_URL}/api/users/${String(id)}/avatar?v=${String(version)}`;

export async function api<T = undefined>(
  path: string,
  init: { method?: string; json?: unknown; file?: File } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
  };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.file) headers["Content-Type"] = init.file.type;
  const res = await fetch(`${API_URL}/api${path}`, {
    method: init.method ?? "GET",
    headers,
    body:
      init.file ??
      (init.json === undefined ? undefined : JSON.stringify(init.json)),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${String(res.status)})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
