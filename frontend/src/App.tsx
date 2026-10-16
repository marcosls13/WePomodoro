import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Timer from "./pages/Timer";
import Chat from "./pages/Chat";
import Room from "./pages/Room";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/timer" element={<Timer />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/room" element={<Room />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
