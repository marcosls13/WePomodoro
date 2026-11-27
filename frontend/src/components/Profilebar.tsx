import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { Add, Profile, Friends, Burger } from "./icons/Icons";
import NightSwitch from "./NightSwitch";
import { useAuthStore } from "../authStore";
import { post } from "../api";

const sidebarVariants: Variants = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      bounce: 0,
      duration: 0.5,
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: {
      type: "spring",
      bounce: 0,
      duration: 0.4,
    },
  },
};

const itemVariants: Variants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1 },
};

export default function Profilebar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Logging out deletes a guest on the server, so it is also how a guest leaves.
  const exit = async () => {
    try {
      await post("/auth/logout");
    } finally {
      logout();
      void navigate("/");
    }
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center justify-center gap-4">
        <NightSwitch />
        <button
          onClick={() => {
            setIsOpen((prev) => !prev);
          }}
          className="bg-white p-3 rounded-full shadow-md transition-colors cursor-pointer dark:bg-slate-900"
          aria-label="Toggle Menu"
        >
          <Burger />
        </button>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            variants={sidebarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-20 right-0 z-45 flex flex-col gap-2 w-fit rounded-full bg-white shadow-xl m-6 p-3 items-center dark:bg-slate-900"
          >
            <motion.div variants={itemVariants}>
              <NavLink to="/create" aria-label="Rooms">
                <div className="bg-red-600 p-3 rounded-full">
                  <Add />
                </div>
              </NavLink>
            </motion.div>

            {user && (
              <motion.div variants={itemVariants}>
                <NavLink to="/friends" aria-label="Friends">
                  <div className="bg-red-600 rounded-full p-3">
                    <Friends />
                  </div>
                </NavLink>
              </motion.div>
            )}

            {user && (
              <motion.div variants={itemVariants}>
                <NavLink to="/profile" aria-label="Profile">
                  <div className="bg-red-600 rounded-full p-3">
                    <Profile />
                  </div>
                </NavLink>
              </motion.div>
            )}

            <motion.div variants={itemVariants} className="mt-auto">
              <button
                onClick={() => void exit()}
                aria-label="Exit"
                className="bg-gray-900 rounded-full px-3 py-3 text-xs font-bold text-white cursor-pointer"
              >
                Exit
              </button>
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
