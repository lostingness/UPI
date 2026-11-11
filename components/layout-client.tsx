// Small client bits: logout, mobile menu, scroll reveal, animated figures, FAQ.
// Motion: one ease-out curve, named transitions only, no looping motion.
//
// Resilience notes (mobile multi-click bug, measured 2026-11-11):
// - MobileMenu is a native <details>/<summary>: it opens on the FIRST tap
//   even before React hydrates (or with JS disabled entirely). Client JS
//   only adds aria-expanded sync, Escape/arrow keys, link-close and
//   tap-outside close — none of it is required to open the menu.
// - Reveal renders VISIBLE by default and only opts into the hidden
//   .reveal state once JS has run (see Reveal). If hydration fails, no
//   landing section can stay invisible.
// - touch-action: manipulation on every button/link here kills the 300ms
//   tap delay / double-tap zoom on mobile; .btn already gives an instant
//   pressed state (active:scale).
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postApi } from "./api";
import { inr } from "./ui";

// useLayoutEffect on the client, useEffect on the server (avoids the SSR
// "useLayoutEffect does nothing on the server" warning). Used by Reveal so
// the hidden state is applied before first paint, never after it.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={`${compact ? "btn btn-secondary btn-sm" : "btn btn-secondary w-full"} touch-manipulation`}
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

/**
 * Mobile menu, CSS-first: native <details>/<summary> opens and closes with
 * zero JS (first tap works before hydration). After hydration a tiny
 * enhancement syncs aria-expanded, closes on Escape / tap-outside / link
 * click, and moves focus with arrow keys. The `below` prop picks the
 * breakpoint under which the menu shows: "md" (public nav, desktop links
 * appear at md) or "lg" (dashboard shell, sidebar appears at lg — so the
 * menu must stay visible through 768–1023px, where there is no sidebar).
 * Round 5: links carry optional lucide icons + a `group` section label
 * (Merchant / Admin) and an optional `userChip`, matching the LiquidNav
 * bottom sheet — the old bare text list is gone. The dropdown scrolls
 * internally so a long grouped list never overflows a small screen.
 */
export function MobileMenu({ links, active, below = "md", userChip }: {
  links: { href: string; label: string; icon?: ReactNode; group?: string }[];
  active?: string;
  below?: "md" | "lg";
  userChip?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    // Sync aria-expanded with the real (possibly pre-hydration) open state.
    const sync = () => setOpen(el.open);
    sync();
    el.addEventListener("toggle", sync);
    // Tap-outside close (enhancement only — no-JS path is unaffected).
    const onDocClick = (e: MouseEvent) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!el.open) return;
      if (e.key === "Escape") {
        el.open = false;
        el.querySelector("summary")?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const target = e.target as Node | null;
        if (!target || !el.contains(target)) return;
        e.preventDefault();
        const items = Array.from(listRef.current?.querySelectorAll("a") ?? []);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLAnchorElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("toggle", sync);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const close = () => {
    const el = detailsRef.current;
    if (el) el.open = false;
  };

  // Group consecutive links by section label, preserving order.
  const groups: { label: string | null; links: typeof links }[] = [];
  for (const l of links) {
    const label = l.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.links.push(l);
    else groups.push({ label, links: [l] });
  }

  return (
    <details ref={detailsRef} className={`group relative ${below === "lg" ? "lg:hidden" : "md:hidden"}`}>
      <summary
        aria-expanded={open}
        aria-label="Menu"
        aria-controls={panelId}
        style={{ touchAction: "manipulation" }}
        className="btn btn-secondary btn-sm touch-manipulation list-none select-none [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg viewBox="0 0 24 24" className="hidden h-4 w-4 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        Menu
      </summary>
      <div ref={listRef} id={panelId} className="animate-menu absolute right-0 top-11 z-50 max-h-[70dvh] w-64 overflow-y-auto rounded-xl bg-[var(--surface)] p-2 shadow-[var(--shadow)] ring-1 ring-[var(--border)]" role="menu">
        {userChip && (
          <div className="mb-1 flex items-center gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 ring-1 ring-[var(--border)]">
            {userChip}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label ?? "all"}>
            {g.label && (
              <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)]">
                {g.label}
              </p>
            )}
            {g.links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" onClick={close}
                aria-current={active === l.href ? "page" : undefined}
                style={{ touchAction: "manipulation" }}
                className={`flex h-10 touch-manipulation items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${active === l.href ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"}`}>
                {l.icon && (
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ring-[var(--border)] ${active === l.href ? "bg-[var(--surface)] text-[var(--accent-text)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`} aria-hidden="true">
                    {l.icon}
                  </span>
                )}
                <span className="min-w-0 truncate">{l.label}</span>
                {active === l.href && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-text)]" aria-hidden="true" />
                )}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

/** True while the page is scrolled more than 8px. Shared by ScrollHeader. */
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/**
 * Sticky glass header with a scroll state: past 8px it gains the stronger
 * blur + bottom border (via scrolledClassName). Round 5 rule: the scroll
 * state must NEVER change the header's height, padding or font size —
 * only background/border/shadow may change (the old compact-on-scroll
 * behaviour is what made the nav shrink; it is gone). Transitions are
 * disabled under prefers-reduced-motion. Server components use this
 * instead of a raw <header> because they cannot run the scroll listener
 * themselves.
 */
export function ScrollHeader({ className = "", scrolledClassName = "", children }: { className?: string; scrolledClassName?: string; children: ReactNode }) {
  const scrolled = useScrolled();
  return (
    <header data-scrolled={scrolled ? "true" : "false"} className={`group ${className}${scrolled ? ` ${scrolledClassName}` : ""}`}>
      {children}
    </header>
  );
}

/**
 * Subtle scroll reveal, once, via IntersectionObserver — but VISIBLE BY
 * DEFAULT. The SSR HTML carries no .reveal class, so with JS disabled or
 * hydration dead the content is simply there. Only after JS runs (layout
 * effect, before paint) is .reveal added; sections already in view get
 * .is-visible in the same commit, so there is no visible→hidden→visible
 * flicker, and below-fold sections fade in when scrolled to.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [visible, setVisible] = useState(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEnhanced(true);
      setVisible(true);
      return;
    }
    // Already in view? Reveal immediately in the same commit (no dip).
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) setVisible(true);
    setEnhanced(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`${enhanced ? "reveal" : ""}${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
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
        style={{ touchAction: "manipulation" }}
        className="flex w-full touch-manipulation items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-[var(--surface-2)]">
        <span className="text-sm font-medium text-[var(--text)]">{q}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-[var(--faint)] transition-[transform] duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className={`grid transition-opacity duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden"><p className="px-5 pb-5 text-sm leading-relaxed text-[var(--muted)]">{a}</p></div>
      </div>
    </div>
  );
}
