import { NavLink, Link, Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import UserInfo from "./pages/UserInfo";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import SignGuest from "./pages/SignGuest";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Tomato from "./Tomato";

export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Tomato size={40} />
          </span>
          WePomodoro
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/UserInfo">Community</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <Link to="/auth/signup" className="button button-small">
          Join us <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main id="main-content" className="page-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/UserInfo" element={<UserInfo />} />
          <Route path="*" element={<NotFound />} />
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/login" element={<SignIn />} />
          <Route path="/auth/guest" element={<SignGuest />} />
          <Route path="/auth/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
    </div>
  );
}
