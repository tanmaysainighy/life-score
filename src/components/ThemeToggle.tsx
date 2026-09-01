"use client";

import { useEffect, useState } from "react";

/** Light / dark / follow-system, persisted. The blocking script in the layout
 *  applies the saved choice before first paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ls-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  function toggle() {
    const root = document.documentElement;
    const current = theme
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("ls-theme", next);
    setTheme(next);
  }

  return (
    <button onClick={toggle} className="btn btn-bare" aria-label="Toggle colour theme">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </svg>
    </button>
  );
}
