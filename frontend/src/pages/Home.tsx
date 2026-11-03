import { Link } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import SigninForm from "../components/SigninForm"; 
import CreatePanel from "../components/CreatePanel";

export default function Home() {
  const [loginMode, setLoginMode] = useState(false);    

  return (
    <div className="flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-24 py-12 overflow-hidden bg-gray-50">
      
      <div className="flex flex-col items-center text-center lg:text-left lg:items-start max-w-2xl space-y-6">
        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-tight">
          Your time is your <span className="text-red-600">most valuable</span> asset.
        </h1>
        <p className="text-lg lg:text-xl text-gray-600 font-medium">
          Sync your peak focus cycles. Team-driven deep work, zero distractions.
        </p>

        <div className="pt-4">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-full bg-gray-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-gray-700 hover:-translate-y-0.5 transition-all duration-200"
          >
            Sync your focus
          </Link>
        </div>
      </div>

      <div className="w-full max-w-md relative min-h-[450px] flex justify-center items-center">
        <AnimatePresence mode="wait">
          {loginMode ? (
            <motion.div
              key="panel-login"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="w-full"
            >
              <SigninForm onSwitchMode={() => setLoginMode(false)} />
            </motion.div>
          ) : (
            <motion.div
              key="panel-create"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="w-full"
            >
              <CreatePanel onSwitchMode={() => setLoginMode(true)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
