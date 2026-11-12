import { Link } from "react-router";

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      <h1 className="text-6xl font-bold">WePomodoro</h1>
      <Link to="/about" className="text-blue-600 underline hover:text-blue-800">
        About
      </Link>
      <Link to="/timer" className="text-blue-600 underline hover:text-blue-800">
        Timer
      </Link>
    </main>
  );
}
