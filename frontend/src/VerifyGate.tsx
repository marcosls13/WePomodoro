import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { API_URL } from "./api";

// An account that hasn't verified its email may not use the app: while a token
// is stored and /auth/me says "unverified", every page except the verify page
// redirects there. Renders nothing while that is being checked.
export default function VerifyGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [state, setState] = useState<{ path: string; pending: boolean }>();

  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    const controller = new AbortController();
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401) localStorage.removeItem("token");
        const me = res.ok
          ? ((await res.json()) as {
              type: string;
              profile: { emailVerifiedAt?: string | null };
            })
          : null;
        setState({
          path: pathname,
          pending: me?.type === "user" && !me.profile.emailVerifiedAt,
        });
      })
      .catch(() => {
        // API unreachable: let the page show its own error.
        if (!controller.signal.aborted)
          setState({ path: pathname, pending: false });
      });
    return () => {
      controller.abort();
    };
  }, [pathname]);

  if (pathname === "/auth/verify-email") return children;
  if (state?.path !== pathname) return null;
  return state.pending ? (
    <Navigate to="/auth/verify-email" replace />
  ) : (
    children
  );
}
