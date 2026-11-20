import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import Logo from "./Logo.tsx";
import NightSwitch from "./NightSwitch";

interface NavItemProps {
  to: string;
  content: string;
  isPrimary?: boolean;
  onClick: () => void;
}

function NavbarButton({
  to,
  content,
  isPrimary = false,
  onClick,
}: NavItemProps) {
  const baseStyles =
    "px-6 py-2.5 rounded-full font-medium transition-all duration-200 text-sm block";
  const primaryStyles =
    "bg-red-600 text-white shadow-md hover:bg-red-700 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]";
  const secondaryStyles = "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  return (
    <li>
      <NavLink
        to={to}
        onClick={onClick}
        className={({ isActive }) =>
          `${baseStyles} ${isPrimary ? primaryStyles : secondaryStyles} ${
            !isPrimary && isActive
              ? "text-gray-900 bg-gray-100 font-semibold"
              : ""
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
    <header className="px-6 py-4 w-full">
      <nav className="mx-auto flex max-w-6xl justify-between items-center bg-white border border-gray-200 rounded-full shadow-sm px-3 py-2 dark:bg-slate-900 dark:border-slate-800 dark:shadow-xl transition-colors">
        <div className="flex items-center ml-2">
          <Logo className="size-8 text-red-600 dark:text-red-500" />
          <span className="ml-3 font-bold text-xl tracking-tight text-gray-900 dark:text-white hidden sm:block">
            WePomodoro
          </span>
        </div>

        <button
          onClick={toggleMenu}
          className="md:hidden p-2 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 focus:outline-none"
          aria-label="Toggle menu"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isMenuOpen ? (
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke="currentColor"
                className="text-gray-900 dark:text-white"
              />
            ) : (
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                className="text-gray-900 dark:text-white"
              />
            )}
          </svg>
        </button>

        {/* Menú de navegación (Escritorio y Móvil desplegable) */}
        <ul
          className={`
          flex flex-col md:flex-row items-center gap-2 md:gap-1
          absolute md:static top-[12%] left-6 right-6
          bg-white md:bg-transparent dark:bg-slate-900 md:dark:bg-transparent
          border border-gray-200 md:border-none dark:border-slate-800
          rounded-2xl md:rounded-none shadow-lg md:shadow-none
          p-4 md:p-0 transition-all duration-300 origin-top z-20
          ${isMenuOpen ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0 md:opacity-100 md:scale-y-100 pointer-events-none md:pointer-events-auto"}
        `}
        >
          <NavbarButton to="/" content="Home" onClick={closeMenu} />
          <NavbarButton to="/about" content="About" onClick={closeMenu} />

          <div className="w-full h-px bg-gray-100 dark:bg-slate-800 md:hidden my-2"></div>

          <NavbarButton
            to="/signup"
            content="Own your time"
            isPrimary={true}
            onClick={closeMenu}
          />
          <NightSwitch />
        </ul>
      </nav>
    </header>
  );
}
