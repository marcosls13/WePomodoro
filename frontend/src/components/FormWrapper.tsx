import type { ReactNode } from "react";

interface FormWrapperProps {
  children: ReactNode;
}

export default function FormWrapper({ children }: FormWrapperProps) {
  return (
    <div className="w-full">
      <div className="bg-white p-5 rounded-2xl shadow-xl border border-gray-100 dark:bg-slate-800 dark:border-slate-900">
        {children}
      </div>
    </div>
  );
}
