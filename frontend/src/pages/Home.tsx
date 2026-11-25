import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import SignInForm from "../components/SignInForm";
import SignUpForm from "../components/SignUpForm";
import Guest from "../components/Guest";

export type AuthPanelMode = "guest" | "signin" | "signup";

const MODE_OPTIONS: { id: AuthPanelMode; label: string }[] = [
  { id: "guest", label: "Guest" },
  { id: "signin", label: "Sign In" },
  { id: "signup", label: "Sign Up" },
];

export default function Home() {
  const [panelMode, setPanelMode] = useState<AuthPanelMode>("guest");

  return (
    <div className="flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-24 py-12 overflow-hidden">
      <div className="flex flex-col items-center text-center lg:text-left lg:items-start max-w-2xl space-y-6">
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-tight dark:text-white">
          Your time is your <span className="text-red-600">most valuable</span>{" "}
          asset.
        </h1>
        <p className="text-lg lg:text-xl text-gray-600 font-medium dark:text-gray-300">
          Sync your peak focus cycles. Team-driven deep work, zero distractions.
        </p>

        <div className="pt-4">
          <button
            type="button"
            onClick={() => setPanelMode("signup")}
            className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-200 dark:bg-slate-800"
          >
            Sync your focus
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 w-full max-w-md bg-transparent">
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="grid grid-cols-3 gap-1 rounded-full bg-white border border-gray-100 dark:border-slate-900  p-1 dark:bg-slate-800"
        >
          {MODE_OPTIONS.map((option) => {
            const active = panelMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPanelMode(option.id)}
                className={`relative rounded-full py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="auth-mode-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-gray-900 dark:bg-red-600"
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={panelMode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full"
            >
              {panelMode === "guest" && <Guest />}
              {panelMode === "signin" && <SignInForm />}
              {panelMode === "signup" && <SignUpForm />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
