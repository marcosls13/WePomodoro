import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
// import VerifyCode from "./pages/VerifyCode";
// import OAuthCallback from "./pages/OAuthCallback";
// import VerifyEmail from "./pages/VerifyEmail";
// import ForgotPassword from "./pages/ForgotPassword";
// import ResetPassword from "./pages/ResetPassword";
// import Ejected from "./pages/Ejected";
// import MainPage from "./pages/MainPage";
// import RoomPage from "./pages/RoomPage";
// import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
// import SecurityPanel from "./pages/SecurityPanel";
// import Admin from "./pages/Admin";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
// import { RegisteredRoute } from "./components/RegisteredRoute";
import { AdminRoute } from "./components/AdminRoute";
// import { ProfileView } from "./views/ProfileView";

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<SignUp />} />
        {/* <Route path="/signup/verify" element={<VerifyCode />} />
        <Route path="/auth/oauth" element={<OAuthCallback />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/ejected" element={<Ejected />} /> */}
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedLayout />}>
        {/* <Route path="/create" element={<MainPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route element={<RegisteredRoute />}>
          <Route path="/friends" element={<Friends />} />
          <Route path="/profile" element={<ProfileView />}> */}
            <Route index element={<Profile />} />
            {/* <Route path="security" element={<SecurityPanel />} /> */}
          {/* </Route> */}
        </Route>
        <Route element={<AdminRoute />}>
          {/* <Route path="/admin" element={<Admin />} /> */}
        </Route>
      {/* </Route> */}
    </Routes>
  );
}

export default App;
