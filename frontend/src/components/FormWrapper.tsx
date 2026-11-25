import { ReactNode } from "react";

interface FormWrapperProps {
  children: ReactNode;
}

export default function FormWrapper({ children }: FormWrapperProps) {
  return (
      <section className="bg-white p-5 rounded-2xl border border-gray-100 dark:bg-slate-800 dark:border-slate-900 w-full flex flex-col items-center-justify-center">
        {children}
      </section>
  );
}
