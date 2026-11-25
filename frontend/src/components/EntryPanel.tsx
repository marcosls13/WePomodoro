import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import GuestForm from "./GuestForm";
import SignInForm from "./SigninForm";
import SignUpForm from "./SignupForm";

type Mode = "guest" | "login" | "register";

const tabs: { mode: Mode; label: string }[] = [
  { mode: "guest", label: "Guest" },
  { mode: "login", label: "Log in" },
  { mode: "register", label: "Register" },
];

export default function EntryPanel() {
  const [mode, setMode] = useState<Mode>("guest");

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            onClick={() => setMode(tab.mode)}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
              mode === tab.mode
                ? "bg-red-600 text-white shadow"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="w-full flex justify-center"
        >
          {mode === "guest" && <GuestForm />}
          {mode === "login" && <SignInForm />}
          {mode === "register" && <SignUpForm />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
