// Theme toggle — sun/moon switch for nav, pay page and dashboard.
// Toggles `html.dark` + localStorage `upi-theme`. Renders a neutral
// placeholder until mounted so SSR HTML never mismatches hydration.
// Round 5: 36px round button with a token ring so it aligns with the
// fixed-height (60/64px) nav bar and the icon chips in the mobile sheet.
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !(dark ?? false);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("upi-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — class toggle still applies for the session */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      style={{ touchAction: "manipulation" }}
      className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-full text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      {dark === null ? (
        <span className="h-4 w-4 rounded-full border border-[var(--faint)]" aria-hidden="true" />
      ) : dark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
