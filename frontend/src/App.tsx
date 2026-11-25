import { BrowserRouter, Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import Navbar from "./components/Navbar";
import Room from "./pages/Room";
import Profile from "./pages/Profile";
import MainPage from "./pages/MainPage";
import RoomLobby from "./pages/RoomLobby";
import Friends from "./pages/Friends";
import CreatePanel from "./components/CreatePanel";
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuthStore } from "./authStore";

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/lobby" element={<RoomLobby />} />
	<Route path="/room/:roomId" element={<Room/>}/>
        <Route path="/profile" element={<Profile />}/>
	<Route path="/friends" element={<Friends/>}/>
        <Route path="create" element={<MainPage />} />
      </Route>
    </Routes>
    </BrowserRouter>
  );
}

export default App;
