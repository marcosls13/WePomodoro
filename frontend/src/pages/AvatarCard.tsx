import { useState } from "react";
import { api } from "../api";
import Avatar from "../Avatar";

export default function AvatarCard({ id }: { id: number }) {
  const [version, setVersion] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError("");
    setPending(true);
    try {
      await action();
      setVersion(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="signup-card">
      <h2 className="signup-title">Profile picture</h2>
      <p className="form-description">PNG, JPEG or WebP, up to 512 KB.</p>
      <div className="avatar-row">
        <Avatar id={id} size={96} version={version} />
        <div className="signup-form">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(() =>
                  api(`/users/me/avatar`, { method: "PUT", file }),
                );
            }}
          />
          <button
            type="button"
            className="text-link"
            disabled={pending}
            onClick={() => {
              void run(() => api(`/users/me/avatar`, { method: "DELETE" }));
            }}
          >
            Remove picture
          </button>
        </div>
      </div>
      {error && (
        <p className="signup-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
