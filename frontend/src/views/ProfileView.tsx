import { NavLink, Outlet } from 'react-router-dom';

// 1. Extraemos la función fuera del componente. No se recrea en cada render.
// 2. Limpiamos las redundancias de Tailwind y arreglamos las clases inexistentes.
const getTabStyles = ({ isActive }: { isActive: boolean }) => {
  const baseClasses = "px-4 py-2 rounded-full font-medium transition-colors text-black hover:bg-gray-100";
  const activeClasses = isActive ? "bg-gray-100 font-semibold" : "";
  
  return `${baseClasses} ${activeClasses}`.trim();
};

export const ProfileView = () => {
  return (
    // Se elimina el shadow interno para dejar una única tarjeta limpia
    <div className="flex flex-col flex-grow m-3 bg-white rounded-lg shadow-lg overflow-hidden">
      
      {/* Navegación separada por un borde sutil, no más cajas raras */}
      <nav className="flex space-x-2 p-4">
        <NavLink to="/profile" end className={getTabStyles}>
          General
        </NavLink>
        <NavLink to="/profile/security" className={getTabStyles}>
          Seguridad
        </NavLink>
        <NavLink to="/profile/history" className={getTabStyles}>
          Historial
        </NavLink>
      </nav>

      {/* Contenedor del Outlet simplificado */}
      <div className="p-6">
        <Outlet />
      </div>
      
    </div>
  );
};
