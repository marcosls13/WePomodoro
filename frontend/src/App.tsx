import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import OAuthCallback from "./pages/OAuthCallback";
import MainPage from "./pages/MainPage";
import RoomPage from "./pages/RoomPage";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout, RegisteredRoute } from "./layouts/ProtectedLayout";
import EjectedNotice from "./components/EjectedNotice";

function App() {
  return (
    <>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/auth/oauth" element={<OAuthCallback />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route element={<ProtectedLayout />}>
          <Route path="/create" element={<MainPage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route element={<RegisteredRoute />}>
            <Route path="/friends" element={<Friends />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
      <EjectedNotice />
    </>
  );
}

export default App;
