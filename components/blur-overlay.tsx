// Blur-on-click overlay — a brief visual beat on navigation taps.
// Mounted once in the root layout. On any link/button click it fades a
// pointer-events-none backdrop-blur layer in for ~200ms, then out. It is
// z-20, BELOW the nav (z-40), so the nav stays crisp. It never calls
// preventDefault, never delays navigation, and is skipped entirely under
// prefers-reduced-motion.
"use client";

import { useEffect, useState } from "react";

export function BlurOverlay() {
  const [blurring, setBlurring] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const onClick = (e: MouseEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("a, button")) return;
      setBlurring(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBlurring(false), 200);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
    };
  }, []);

  return <div aria-hidden="true" className={`blur-overlay${blurring ? " is-blurring" : ""}`} />;
}
