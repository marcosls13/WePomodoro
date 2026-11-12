import { Link } from "react-router";

export default function About() {
  return (
    <main className="flex flex-col min-h-screen items-center justify-center bg-gray-100 text-5xl gap-32">
      This is the about page!
      <Link to="/" className="text-blue-600 underline hover:text-blue-800">
        Go back to the homepage
      </Link>
    </main>
  );
}
