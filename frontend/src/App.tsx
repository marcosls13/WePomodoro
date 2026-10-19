import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Navbar from "./components/Navbar";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import SecurityPanel from "./pages/SecurityPanel"
import { PublicLayout } from "./layouts/PublicLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ProfileView } from "./views/ProfileView";
import { useAuthStore } from "./authStore";

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/user_id" element={<Profile />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/profile" element={<ProfileView />}>
           <Route index element={<Profile />} /> 
	   <Route path="security" element={<SecurityPanel />} />
	</Route>
      </Route>
    </Routes>
  );
}

export default App;
