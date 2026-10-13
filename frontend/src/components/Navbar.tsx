import { useState } from "react";
import { NavLink } from "react-router"; // Importación obligatoria
import Logo from "./Logo.tsx";

interface NavItemProps {
  to: string;
  content: string;
  isPrimary?: boolean; // Permite destacar solo el botón principal
  onClick: () => void;
}

function NavbarButton({ to, content, isPrimary = false, onClick }: NavItemProps) {
  const baseStyles = "px-6 py-2.5 rounded-full font-medium transition-all duration-200 text-sm block"; 
  const primaryStyles = "bg-red-600 text-white shadow-md hover:bg-red-700 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]";
  const secondaryStyles = "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  return (
    <li>
      <NavLink
        to={to}
	onClick={onClick}
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

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="px-6 py-4 w-full bg-gray-50">
      <nav className="mx-auto flex max-w-6xl justify-between items-center bg-white border border-gray-200 rounded-full shadow-sm px-3 py-2">
        
        <div className="flex items-center ml-2">
          <Logo className="size-8 text-red-600" />
          <span className="ml-3 font-bold text-xl tracking-tight text-gray-900 hidden sm:block">
            WePomodoro
          </span>
        </div>
        <button 
          onClick={toggleMenu}
          className="md:hidden p-2 text-gray-600 hover:text-red-600 focus:outline-none"
          aria-label="Toggle menu"
        >
	  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
	    {isMenuOpen ? (
              <path d="M6 18L18 6M6 6l12 12" stroke="#000000" /> // Icono 'X'
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" /> // Icono Hamburguesa
            )}
          </svg>
        </button>
	<ul className={`
          flex flex-col md:flex-row items-center gap-2 md:gap-1
          absolute md:static top-[12%] left-6 right-6
          bg-white md:bg-transparent border border-gray-200 md:border-none rounded-2xl md:rounded-none shadow-lg md:shadow-none
          p-4 md:p-0 transition-all duration-300 origin-top z-20
          ${isMenuOpen ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0 md:opacity-100 md:scale-y-100 pointer-events-none md:pointer-events-auto"}
        `}>
          <NavbarButton to="/" content="Home" onClick={closeMenu} />
          <NavbarButton to="/about" content="About" onClick={closeMenu} />
          <div className="w-full h-px bg-gray-100 md:hidden my-2"></div> {/* Separador en móvil */}
          <NavbarButton to="/signup" content="Own your time" isPrimary={true} onClick={closeMenu} />
        </ul>
      </nav>
    </header>
  );
}
