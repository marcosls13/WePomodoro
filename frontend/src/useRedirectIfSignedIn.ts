import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

// For the sign-in, sign-up and guest pages: someone who is already signed in
// is sent on instead of seeing the form. A stored token only counts if the API
// still accepts it; an expired one is dropped so the form shows. Returns true
// while that check is running (render nothing until it settles).
export function useRedirectIfSignedIn(to = "/UserInfo") {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(() =>
    Boolean(localStorage.getItem("token")),
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const controller = new AbortController();
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (res.ok) {
          void navigate(to, { replace: true });
          return;
        }
        if (res.status === 401) localStorage.removeItem("token");
        setChecking(false);
      })
      .catch(() => {
        // API unreachable: show the form rather than a blank page.
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => {
      controller.abort();
    };
  }, [navigate, to]);

  return checking;
}
