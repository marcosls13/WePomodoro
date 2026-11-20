import { NavLink, Link, Navigate, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import UserInfo from "./pages/UserInfo";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Navbar from "./components/Navbar";
import Room from "./pages/Room";
import Profile from "./pages/Profile";
import SecurityPanel from "./pages/SecurityPanel"
import MainPage from "./pages/MainPage"
import CreatePanel from "./components/CreatePanel"
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProfileView } from "./views/ProfileView";
import { useAuthStore } from "./authStore";
import SignIn from "./pages/SignIn";
import SignGuest from "./pages/SignGuest";
import VerifyEmail from "./pages/VerifyEmail";
import OAuthCallback from "./pages/OAuthCallback";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Me from "./pages/Me";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Sessions from "./pages/Sessions";
import Session from "./pages/Session";
import Tomato from "./Tomato";
import ThemeToggle from "./ThemeToggle";
import VerifyGate from "./VerifyGate";

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

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
          <NavLink to="/home" end>
            Home
          </NavLink>
          <NavLink to="/sessions">Sessions</NavLink>
          <NavLink to="/UserInfo">Community</NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/me">Me</NavLink>
        </nav>
        <div className="header-actions">
          <Link to="/auth/signup" className="button button-small">
            Join us <span aria-hidden="true">↗</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="page-content" tabIndex={-1}>
        <VerifyGate>
          <Routes>
            <Route element={<PublicLayout />}>
        <Route path="/" element={<Navigate to="/auth/login" replace />} />
            <Route path="/home" element={<Home />} />
              <Route path="/about" element={<About />} />
            <Route path="/me" element={<Me />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<Session />} />
            <Route path="/UserInfo" element={<UserInfo />} />
            <Route path="/users/:id" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
                    <Route path="/auth/signup" element={<SignUp />} />
            <Route path="/auth/login" element={<SignIn />} />
            <Route path="/auth/guest" element={<SignGuest />} />
            <Route path="/auth/oauth" element={<OAuthCallback />} />
            <Route path="/auth/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/chat" element={<Room />} />
        <Route path="/profile" element={<ProfileView />}>
           <Route index element={<Profile />} /> 
	   <Route path="security" element={<SecurityPanel />} />
	</Route>
	<Route path="create" element={<MainPage />} />
      </Route>
    </Routes>
        </VerifyGate>
      </main>
    </div>
  );
}
