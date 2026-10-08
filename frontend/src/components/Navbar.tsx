import { NavLink } from "react-router"; // Importación obligatoria
import Logo from "./Logo.tsx";

interface NavItemProps {
  to: string;
  content: string;
  isPrimary?: boolean; // Permite destacar solo el botón principal
}

function NavbarButton({ to, content, isPrimary = false }: NavItemProps) {
  const baseStyles = "px-6 py-2.5 rounded-full font-medium transition-all duration-200 text-sm block"; 
  const primaryStyles = "bg-red-600 text-white shadow-md hover:bg-red-700 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]";
  const secondaryStyles = "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `${baseStyles} ${isPrimary ? primaryStyles : secondaryStyles} ${
            !isPrimary && isActive ? "text-gray-900 bg-gray-100 font-semibold" : ""
          }`
        }
      >
        {content}
      </NavLink>
    </li>
  );
}

export default function Navbar() {
  return (
    <header className="px-6 py-4 w-full bg-gray-50">
      <nav className="mx-auto flex max-w-6xl justify-between items-center bg-white border border-gray-200 rounded-full shadow-sm px-3 py-2">
        
        <div className="flex items-center ml-2">
          <Logo className="size-8 text-red-600" />
          <span className="ml-3 font-bold text-xl tracking-tight text-gray-900">
            WePomodoro
          </span>
        </div>
        
        <ul className="flex items-center gap-1 mr-1">
          <NavbarButton to="/" content="Home" />
          <NavbarButton to="/about" content="About" />
          {/* Solo ESTE botón recibe el tratamiento visual agresivo */}
          <NavbarButton to="/signup" content="Own your time" isPrimary={true} />
        </ul>

      </nav>
    </header>
  );
}
