import { Link } from "react-router";

export default function Home() {
  return (
    // h-full le dice que ocupe todo el alto que le heredó <main className="flex-grow">
    <div className="flex-grow flex flex-row items-center justify-around overflow-hidden">
      <h1 className="text-3xl text-red-600 animate-slide-up">
        Your time is your most valuable asset.
      </h1>
      <div>
      <h1>Este es otro texto random para probar la disposición</h1>
        
      </div>
      {/* Tu enlace */}
    </div>
  );
}
