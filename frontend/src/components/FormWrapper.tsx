import { ReactNode } from "react";

interface FormWrapperProps {
	children: ReactNode;
}


export default function FormWrapper({children}: FormWrapperProps)
{
	return(
		    <div className="w-full max-w-md">
                       <div className="bg-white p-5 rounded-2xl shadow-xl border border-gray-100">
		       {children}
		       </div>
		       </div>
	);
};
