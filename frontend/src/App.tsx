import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Navbar from "./components/Navbar";

function App() {
  return (
   <div className="flex flex-col min-h-screen font-custom">
    <Navbar />
    <main className="flex-grow flex flex-col">
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<NotFound />} />
      <Route path="/signup" element={<SignUp />} />
    </Routes>
    < /main>
   < /div>
  );
}

export default App;
