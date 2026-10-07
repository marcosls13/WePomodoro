import React from 'react'
import Logo from "./Logo.tsx" 

function NavbarButton({content})
{
	return (
	     <li className="bg-red-600 text-white p-2 rounded-full hover:bg-white hover:text-red-600 border-red-600 border-1 shadow-md hover:shadow-xl transition-all duration-300 ease-out hover:-translate-y-1"><a href="/">{content}</a></li>
	)
}
export default function Navbar()
{
	return (
	 <nav className="flex justify-between items-center border-1 border-red-600  rounded-full m-4">
	   <Logo className="size-10 m-3"/>
	   <ul className="flex gap-3 m-3">
	   <NavbarButton content="Home"/>
	   <NavbarButton content="Sign up"/>
	   <NavbarButton content="Meh"/>
	   </ul>
	 </nav>
	)
}
