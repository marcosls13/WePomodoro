import { useState } from "react";
import FormWrapper from "../components/FormWrapper";
import { SubmitButton } from "./SubmitButton";
import { FormHeader } from "./FormHeader";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitted(true);
  };

  return (
    <FormWrapper>
      <section className="flex flex-col items-center justify-center w-full py-4">
        <FormHeader
          title="Reset Password"
          subtitle="Enter your email to receive a recovery link"
        />

        {!isSubmitted ? (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col w-full gap-4 mt-6"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="px-4 py-3 border-2 border-black dark:border-slate-700 rounded-full font-mono focus:outline-none focus:border-red-600 w-full placeholder:font-custom dark:bg-slate-900 dark:text-white"
            />
            <SubmitButton>Send Recovery Link</SubmitButton>
          </form>
        ) : (
          <div className="flex flex-col items-center text-center mt-6 gap-4 w-full">
            <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-2xl text-green-800 dark:text-green-300 text-sm">
              ¡Correo enviado! Revisa tu bandeja de entrada para continuar con
              la recuperación.
            </div>
            <button
              onClick={() => setIsSubmitted(false)}
              className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            >
              Intentar con otro correo
            </button>
          </div>
        )}
      </section>
    </FormWrapper>
  );
}
