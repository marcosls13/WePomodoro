import { useState } from "react";
import { NavLink } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Add, Profile, Friends, Burger } from "./icons/Icons";
import NightSwitch from "./NightSwitch";

const sidebarVariants = {
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

const itemVariants = {
  hidden: { x: 20, opacity: 0 },
  visible: { x: 0, opacity: 1 },
};

export default function Profilebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center justify-center gap-4">
        <NightSwitch />
        <button
          onClick={() => setIsOpen((prev) => !prev)}
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
	    <NavLink to="/friends">
	    <div className="bg-red-600 rounded-full p-3">
	    <Friends/>
	    </div>
	    </NavLink>
	    </motion.div>
            <motion.div variants={itemVariants}>
              <NavLink to="/lobby">
                <div className="bg-red-600 rounded-full p-3">
                  <Add />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-auto">
              <NavLink to="/profile">
                <div className="bg-red-600 rounded-full p-3">
                  <Profile />
                </div>
              </NavLink>
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
