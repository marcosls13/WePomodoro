import { useEffect, useState } from "react";
const STORAGE_KEY = "wepomodoro-theme";

export default function NightSwitch() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", darkMode);
    localStorage.setItem(STORAGE_KEY, String(darkMode));
  }, [darkMode]);

  return (
    <>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="px-4 py-2 rounded-full font-medium bg-slate-900 text-white dark:bg-slate-800 dark:text-white hover:opacity-90 transition cursor-pointer"
      >
        {darkMode ? "☀️ " : "🌙"}
      </button>
    </>
  );
}
