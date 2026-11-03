import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Calculator, History, Code, Add, Profile, Burger } from "./icons/Icons";

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
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed top-4 right-4 z-50 bg-white p-3 rounded-full shadow-md hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="Toggle Menu"
      >
        <Burger />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            variants={sidebarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-20 right-0 z-45 flex flex-col gap-2 w-fit rounded-full bg-white shadow-xl m-6 p-3 items-center"
          >
            <motion.div variants={itemVariants}>
              <NavLink to="/group1">
                <div className="bg-red-600 p-3 rounded-full">
                  <Calculator />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/group1">
                <div className="bg-red-600 rounded-full p-3 flex items-center justify-center">
                  <History />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/group1">
                <div className="bg-red-600 rounded-full p-3 flex items-center justify-center">
                  <Code />
                </div>
              </NavLink>
            </motion.div>

            <motion.div variants={itemVariants}>
              <NavLink to="/group1">
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
