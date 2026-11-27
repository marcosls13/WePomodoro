import { useNavigate } from "react-router";
import SingleFieldForm from "./SingleFieldForm";
import { post } from "../api";
import { useAuthStore } from "../authStore";

export default function Guest() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  return (
    <SingleFieldForm
      title="Continue as guest"
      subtitle="Pick a name. Guests keep no stats or friends."
      label="Username"
      placeholder="Anon"
      button="Enter"
      onSubmit={async (displayName) => {
        const res = await post<{ token: string }>("/auth/guest", {
          displayName,
        });
        setSession(res.token, null);
        void navigate("/create");
      }}
    />
  );
}
