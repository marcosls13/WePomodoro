import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Room from "./pages/Room";
import JoinRoom from "./pages/JoinRoom";
import TicTacToe from "./pages/TicTacToe";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/room/join" element={<JoinRoom />} />
      <Route path="/room/:code" element={<Room />} />
      <Route path="/tictactoe" element={<TicTacToe />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
