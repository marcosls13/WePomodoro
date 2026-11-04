import { NavLink } from "react-router";
import Tomato from "./Tomato";

const tabs = [
  { to: "/auth/guest", label: "Guest" },
  { to: "/auth/login", label: "Sign in" },
  { to: "/auth/signup", label: "Create account" },
];

// Banner and tabs shared by the three auth pages: one card, three ways in.
export default function AuthTabs() {
  return (
    <>
      <div className="auth-banner">
        <Tomato size={28} />
        <span>Welcome to WePomodoro</span>
      </div>
      <nav className="auth-tabs" aria-label="Ways to join">
        {tabs.map(({ to, label }) => (
          <NavLink key={to} to={to}>
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
