import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import UserInfo from "./pages/UserInfo";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<NotFound />} />
      <Route path="/UserInfo" element={<UserInfo />} />
      <Route path="/signup" element={<SignUp />} />
    </Routes>
  );
}

export default App;
