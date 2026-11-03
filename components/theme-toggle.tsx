"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button aria-label="Toggle theme" onClick={() => {
      const next = !dark; setDark(next);
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("eqr.theme", next ? "dark" : "light");
    }} className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-ink">
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
