// Small client bits: logout, mobile menu, scroll reveal, animated figures, FAQ.
// Motion: one ease-out curve, named transitions only, no looping motion.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postApi } from "./api";
import { inr } from "./ui";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={compact ? "btn btn-secondary btn-sm" : "btn btn-secondary w-full"}
      onClick={async () => {
        setBusy(true);
        await postApi("/api/auth/logout", {});
        router.push("/login");
        router.refresh();
      }}
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}

/** Slide-down mobile menu: one button, Escape closes, arrow keys move focus. */
export function MobileMenu({ links, active }: { links: { href: string; label: string }[]; active?: string }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(listRef.current?.querySelectorAll("a") ?? []);
        const i = items.indexOf(document.activeElement as HTMLAnchorElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);
  return (
    <div className="relative md:hidden">
      <button
        type="button" aria-expanded={open} aria-label="Menu"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        Menu
      </button>
      {open && (
        <div ref={listRef} className="animate-menu absolute right-0 top-11 z-50 w-56 rounded-xl bg-slate-900 p-2 ring-1 ring-white/10" role="menu">
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)}
              className={`flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${active === l.href ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"}`}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Subtle scroll reveal, once, via IntersectionObserver. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.classList.add("is-visible"); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{children}</div>;
}

/** Number that tweens once on mount. Amounts use the single ₹ 2dp format. */
export function AnimatedMoney({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{prefix}{inr(shown)}</span>;
}

export function AnimatedCount({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{shown.toLocaleString("en-IN")}</span>;
}

/** FAQ accordion: height-free (grid rows), fade + rise only. */
export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-slate-800/50">
        <span className="text-sm font-medium text-slate-100">{q}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-slate-500 transition-[transform] duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={`grid transition-opacity duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden"><p className="px-5 pb-5 text-sm leading-relaxed text-slate-400">{a}</p></div>
      </div>
    </div>
  );
}
