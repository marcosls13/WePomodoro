import { useEffect, useState } from "react";
import { API_URL, api } from "./api";

const providers = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "42", label: "42" },
];

// "Continue with …" buttons for Google, GitHub and 42. The ones the API has
// enabled are links (a full page navigation: the backend redirects to the
// provider and back to /auth/oauth); the rest are greyed out.
export default function OAuthButtons() {
  const [enabled, setEnabled] = useState<string[]>([]);

  useEffect(() => {
    api<{ providers: string[] }>("/auth/oauth")
      .then((res) => {
        setEnabled(res.providers);
      })
      .catch(() => {
        setEnabled([]);
      });
  }, []);

  return (
    <div className="oauth-buttons">
      {providers.map(({ id, label }) =>
        enabled.includes(id) ? (
          <a
            key={id}
            className="button oauth-button"
            href={`${API_URL}/api/auth/oauth/${id}`}
          >
            Continue with {label}
          </a>
        ) : (
          <span
            key={id}
            className="button oauth-button"
            aria-disabled="true"
            title="Not configured on this server"
          >
            Continue with {label}
          </span>
        ),
      )}
    </div>
  );
}
