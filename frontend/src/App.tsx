import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
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

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/signup" element={<SignUp />} />
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
  );
}

export default App;
