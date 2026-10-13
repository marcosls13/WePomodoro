import React, { InputHtmlAttributes } from "react";

interface InputFieldProps extends InputHtmlAttributes<HTMLInputElement> {
  label: string;
  input: string;
}

export function InputField( {label, id, ...props } : InputFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-gray-700 ml-4">
        {label}
      </label>
           <input
             id={id}
              className="w-full rounded-full border border-gray-300 bg-gray-50 px-5 py-3 text-sm transition-all focus:border-red-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
	      {...props}
            />
     </div>
  )
}
