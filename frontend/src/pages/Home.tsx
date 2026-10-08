import { Link } from "react-router";
import SignInForm from "../components/SigninForm.tsx"

export default function Home() {
  return (
    // Contenedor principal: Apilado en móvil, en fila en desktop. Espaciado controlado.
    <div className="flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-24 py-12 overflow-hidden bg-gray-50">
      
      {/* Columna Izquierda: Copywriting y Call to Action */}
      <div className="flex flex-col items-center justify-center text-center lg:text-left lg:items-start lg:justify-left max-w-2xl space-y-6 animate-slide-up">
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-tight">
          Your time is your <span className="text-red-600">most valuable</span> asset.
        </h1>
        <p className="text-lg lg:text-xl text-gray-600 font-medium">
	   Sync your peak focus cycles. Team-driven deep work, zero distractions.
        </p>
        
        <div className="pt-4">
          <Link 
            to="/signup" 
            className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-200"
          >
            Sync your focus
          </Link>
        </div>
      </div>

      {/* Columna Derecha: Contenedor del formulario */}
      <div className="w-full max-w-md animate-slide-up [animation-delay:150ms]">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
          <SignInForm />
        </div>
      </div>
      
    </div>
  );
}
