import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
// import VerifyCode from "./pages/VerifyCode";
// import SignGuest from "./pages/SignGuest";
// import OAuthCallback from "./pages/OAuthCallback";
// import VerifyEmail from "./pages/VerifyEmail";
// import ForgotPassword from "./pages/ForgotPassword";
// import ResetPassword from "./pages/ResetPassword";
// import Room from "./pages/Room";
// import Sessions from "./pages/Sessions";
// import Session from "./pages/Session";
// import UserInfo from "./pages/UserInfo";
// import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
// import History from "./pages/History";
// import Admin from "./pages/Admin";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
// import { AdminRoute } from "./components/AdminRoute";
// import { useAuthStore } from "./authStore";
// import Navbar from "./components/Navbar";
// import Room from "./pages/Room";
// import CreateRoom from "./components/CreateRoom"
// import { ProtectedRoute } from "./components/ProtectedRoute";

function App() {
//   const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/signup" element={<SignUp />} />
        {/* <Route path="/signup/verify" element={<VerifyCode />} />
        <Route path="/auth/guest" element={<SignGuest />} />
        <Route path="/auth/oauth" element={<OAuthCallback />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} /> */}
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* <Route element={<ProtectedLayout />}> */}
        {/* <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:sessionId" element={<Session />} />
        <Route path="/users/:userId" element={<UserInfo />} />
        <Route path="/friends" element={<Friends />} /> */}
        <Route path="/profile" element={<Profile />} />
          {/* <Route path="history" element={<History />} /> */}
        {/* </Route> */}
        {/* <Route element={<AdminRoute/>}>
          <Route path="/admin" element={<Admin/>} />
        </Route> */}
    </Routes>
  );
}

export default App;
