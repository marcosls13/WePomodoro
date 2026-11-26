import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { post } from "../api";
import { useAuthStore, type AuthUser } from "../authStore";
import VerifyCodeForm from "../components/VerifyCodeForm";

// The backend redirects here with ?code= (existing account), ?pending= (new
// account, still needs the emailed code) or ?error=. Only a route can receive
// that redirect; it has no page of its own to speak of.
export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const pending = params.get("pending");
  const code = params.get("code");

  useEffect(() => {
    if (pending) return;
    if (!code) {
      void navigate("/", { replace: true });
      return;
    }
    post<{ token: string; user: AuthUser }>("/auth/oauth/exchange", { code })
      .then((res) => {
        setSession(res.token, res.user);
        void navigate("/create", { replace: true });
      })
      .catch(() => void navigate("/", { replace: true }));
  }, [pending, code, navigate, setSession]);

  if (pending)
    return (
      <div className="flex w-full flex-grow items-center justify-center p-6">
        <div className="w-full max-w-md">
          <VerifyCodeForm pendingToken={pending} onCancel={() => void navigate("/")} />
        </div>
      </div>
    );

  return <p className="p-6 dark:text-white">Signing you in…</p>;
}
