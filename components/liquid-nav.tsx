// Liquid nav — Axion pill navbar (Round 4).
// Floating pill (max-w-[1440px], liquid-glass). Past 8px of scroll it
// compacts and gains the stronger glass treatment. Landing variant: dark
// circle "UG" logo, section links, live IST clock (HH:MM, every second),
// a real gateway status line, "Create payment link" expanding CTA and
// ThemeToggle. Dashboard variant: same pill for the app shell nav.
//
// Mobile menu is a bottom sheet (translate-y, cubic-bezier(0.32,0.72,0,1),
// black/60 backdrop, rounded-2xl, mx-3 mb-3) driven by a native
// <details>/<summary> — the Round 3 first-tap fix: the menu opens on the
// FIRST tap even before hydration (or with JS disabled). Client JS only
// adds aria-expanded sync, Escape/backdrop/link close — none of it is
// required to open the menu.
//
// STRUCTURAL NOTE: the <summary> MUST be a direct child of <details> to
// act as the disclosure toggle (a nested summary does not toggle) — and a
// closed <details> hides all its non-<summary> children, so the pill bar
// itself must NOT be inside it (that hid the whole nav). The <details>
// is therefore a sibling of the pill: its summary is absolutely
// positioned into the pill's reserved right end, and the fixed backdrop
// and bottom sheet are its other children. The sheet/backdrop also stay
// outside the pill because its backdrop-filter would become their
// containing block and break their fixed positioning.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export type LiquidNavLink = { href: string; label: string; active?: boolean };

const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function LiquidNav({
  variant,
  links,
  actions,
}: {
  variant: "landing" | "dashboard";
  links: LiquidNavLink[];
  actions?: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const tick = () => setTime(istTime.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    const sync = () => setOpen(el.open);
    sync();
    el.addEventListener("toggle", sync);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("toggle", sync);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const close = () => {
    const el = detailsRef.current;
    if (el) el.open = false;
  };

  return (
    <div className="sticky top-3 z-40 px-3">
      {/* Relative wrapper: positioning context for the Menu summary, and
          the <details> lives OUTSIDE the pill — a closed <details> hides
          all its non-<summary> children, so the pill bar itself must NOT
          be inside it (that hid the whole nav). The sheet/backdrop are
          also outside the pill because its backdrop-filter would become
          their containing block and break their fixed positioning. */}
      <div className="relative mx-auto max-w-[1440px]">
        <div
          className={`${scrolled ? "liquid-glass-strong" : "liquid-glass"} flex items-center gap-2 rounded-full py-1.5 pl-2 pr-[5.75rem] transition-all duration-200 motion-reduce:transition-none sm:gap-3 sm:pl-3 md:pr-2 ${scrolled ? "sm:py-1" : "sm:py-1.5"}`}
        >
          <Link href="/" className="flex shrink-0 touch-manipulation items-center gap-2.5" aria-label="UPI Gateway — home">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#111111] text-[13px] font-semibold text-white ring-1 ring-white/25" aria-hidden="true">
              UG
            </span>
            <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)] min-[420px]:block">
              UPI Gateway
            </span>
          </Link>

          <nav className="ml-1 hidden min-w-0 items-center gap-0.5 overflow-x-auto md:flex" aria-label="Primary">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={l.active ? "page" : undefined}
                style={{ touchAction: "manipulation" }}
                className={`shrink-0 touch-manipulation rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                  l.active ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {variant === "landing" && (
              <span className="hidden items-center gap-1.5 text-xs font-medium text-[var(--muted)] xl:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Self-hosted · MIT · ₹0 gateway fees
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--muted)] lg:flex">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {time ?? "--:--"} IST
            </span>
            {actions && <div className="hidden items-center gap-2 md:flex">{actions}</div>}
            {variant === "landing" && (
              <Link
                href="/orders/new"
                className="btn-expand hidden touch-manipulation md:inline-flex"
                aria-label="Create payment link"
              >
                <ArrowUpRight className="btn-expand-icon h-4 w-4" aria-hidden="true" />
                <span className="btn-expand-label">
                  <span className="text-roll">
                    <span>Create payment link</span>
                    <span aria-hidden="true">Create payment link</span>
                  </span>
                </span>
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile menu — <details> is a sibling of the pill (see note
            above). Its <summary> is the direct first child, absolutely
            positioned into the pill's reserved right end; the backdrop and
            bottom sheet are fixed, viewport-relative, and hidden by the
            closed <details> until the first tap opens them. */}
        <details ref={detailsRef} data-sheet className="group md:hidden">
          <summary
            aria-expanded={open}
            aria-label="Menu"
            style={{ touchAction: "manipulation" }}
            className="btn btn-secondary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 touch-manipulation list-none select-none [&::-webkit-details-marker]:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg viewBox="0 0 24 24" className="hidden h-4 w-4 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Menu
          </summary>

          {/* Backdrop — below the pill (z-30 < nav z-40) so the Menu/X
              summary stays clickable; click closes (JS enhancement only). */}
          <div
            aria-hidden="true"
            onClick={close}
            className="nav-backdrop fixed inset-0 z-30 bg-black/60"
          />

          {/* Bottom sheet — fixed, slides up on open via details[open] CSS. */}
          <div className="nav-sheet liquid-glass-strong fixed inset-x-0 bottom-0 z-50 mx-3 mb-3 rounded-2xl p-2">
            <div className="mx-auto mt-1 h-1 w-9 rounded-full bg-[var(--border)]" aria-hidden="true" />
            <nav className="mt-2 flex flex-col" aria-label="Sections">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={l.active ? "page" : undefined}
                  onClick={close}
                  style={{ touchAction: "manipulation" }}
                  className={`flex h-11 touch-manipulation items-center rounded-xl px-3 text-[15px] font-medium ${
                    l.active ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            {actions && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-2 pb-1 pt-3">
                {actions}
              </div>
            )}
            <div className="flex items-center justify-between px-3 pb-1 pt-3 text-xs text-[var(--faint)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {time ?? "--:--"} IST
              </span>
              <span>Self-hosted · MIT · ₹0 fees</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
