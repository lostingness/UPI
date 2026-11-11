// Liquid nav — Axion pill navbar (Round 5 rebuild).
// STABLE SIZE (the Round 5 fix): the pill has ONE fixed height — 60px
// below md, 64px at md+ — and it NEVER changes on scroll. Scrolling past
// 8px only swaps the glass treatment (liquid-glass → liquid-glass-strong)
// and adds a border/shadow; no padding, height or font-size change, and
// the height transition is not even animatable (the transition property
// lists only background/box-shadow/backdrop-filter/border-color). The
// user's complaint — "niche krte hi chota hota" (it shrinks when you
// scroll down) — came from the old `sm:py-1` compact rule; that rule is
// gone.
//
// Mobile menu is a bottom sheet driven by a native <details>/<summary> —
// the Round 3 first-tap fix: the menu opens on the FIRST tap even before
// hydration (or with JS disabled). Client JS only adds aria-expanded
// sync, Escape/backdrop/link close — none of it is required to open the
// menu. The sheet is grouped (Merchant / Admin / Explore) with lucide
// icons, a user chip, and a logout row — the old bare text list is gone.
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
//
// Colours go only through the semantic theme tokens (var(--text),
// var(--muted), var(--surface-2), var(--border), var(--accent-text)…);
// no hardcoded white/slate/grey. Another worker owns the token VALUES;
// this nav inherits them.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { SoundToggle } from "./sound-toggle";

export type LiquidNavLink = {
  href: string;
  label: string;
  active?: boolean;
  /** Leading icon (a lucide element, h-4 w-4) shown in the mobile sheet. */
  icon?: ReactNode;
  /** Sheet section this link belongs to ("Merchant" / "Admin" / "Explore"). */
  group?: string;
};

const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Group consecutive links by their `group` label, preserving order. */
function groupLinks(links: LiquidNavLink[]): { label: string | null; links: LiquidNavLink[] }[] {
  const groups: { label: string | null; links: LiquidNavLink[] }[] = [];
  for (const l of links) {
    const label = l.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.links.push(l);
    else groups.push({ label, links: [l] });
  }
  return groups;
}

export function LiquidNav({
  variant,
  links,
  actions,
  sheetActions,
  mobileUser,
}: {
  variant: "landing" | "dashboard";
  links: LiquidNavLink[];
  actions?: ReactNode;
  /** Actions shown in the mobile sheet footer; defaults to `actions`.
      Lets the dashboard sheet show just Log out (the avatar already
      lives in the user chip above) instead of duplicating it. */
  sheetActions?: ReactNode;
  /** User chip (avatar + name/email/role) shown at the top of the mobile sheet. */
  mobileUser?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<string | null>(null);

  // Dashboard shows the desktop link row only from lg (the sidebar appears
  // at lg too); below that the bottom sheet is the nav, so the 768–1023px
  // gap has a menu. Landing shows desktop links from md.
  const bp = variant === "dashboard" ? "lg" : "md";
  const desktop = bp === "lg" ? "lg:flex" : "md:flex";
  const hideBelowDesktop = bp === "lg" ? "lg:hidden" : "md:hidden";
  const groups = groupLinks(links);

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
        {/* FIXED HEIGHT: h-[60px] below md, h-16 (64px) at md+. The height
            never changes with scroll — only the glass treatment does. */}
        <div
          data-testid="liquid-nav-pill"
          className={`${scrolled ? "liquid-glass-strong" : "liquid-glass"} flex h-[60px] items-center gap-2 rounded-full pl-2 pr-[5.75rem] transition-[background-color,box-shadow,backdrop-filter,border-color] duration-200 motion-reduce:transition-none sm:gap-3 sm:pl-3 md:h-16 ${bp}:pr-2`}
        >
          <Link href="/" className="flex shrink-0 touch-manipulation items-center gap-2.5" aria-label="UPI Gateway — home">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--text)] font-display text-[13px] font-semibold text-[var(--bg)] ring-1 ring-[var(--border)]" aria-hidden="true">
              UG
            </span>
            <span className="hidden font-display text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)] min-[420px]:block">
              UPI Gateway
            </span>
          </Link>

          <nav className={`ml-1 hidden min-w-0 items-center gap-0.5 overflow-x-auto ${desktop}`} aria-label="Primary">
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

          {/* Round 5 integration fix: this badge showed from xl (1280px),
              where it crowded the link row and clipped the "Docs" link
              (measured 2026-11-11: "Do…" at exactly 1280px). It now
              appears only from 1440px, where the pill has room for it. */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {variant === "landing" && (
              <span className="hidden items-center gap-1.5 text-xs font-medium text-[var(--muted)] min-[1440px]:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Self-hosted · MIT · ₹0 gateway fees
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--muted)] lg:flex">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {time ?? "--:--"} IST
            </span>
            {actions && <div className={`hidden items-center gap-2 ${desktop}`}>{actions}</div>}
            {/* R5 INTEGRATION — notification bell, mounted in the slot A2
                left for it (dashboard nav only, merchant-only — never on
                the landing nav). The slot sits OUTSIDE the `actions`
                wrapper, which is hidden below lg: the bell stays visible
                in the pill at every width, with one mounted instance (no
                double polling / double chime). */}
            {variant === "dashboard" && (
              <div data-nav-slot="notifications" className="flex items-center">
                <NotificationBell />
              </div>
            )}
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
        <details ref={detailsRef} data-sheet className={`group ${hideBelowDesktop}`}>
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

          {/* Bottom sheet — fixed, slides up on open via details[open] CSS.
              Grouped icon rows; the list scrolls inside the sheet so 14
              dashboard links never overflow a small phone screen. */}
          <div className="nav-sheet liquid-glass-strong fixed inset-x-0 bottom-0 z-50 mx-3 mb-3 max-h-[82dvh] overflow-y-auto rounded-2xl p-2">
            <div className="mx-auto mt-1 h-1 w-9 rounded-full bg-[var(--border)]" aria-hidden="true" />
            {mobileUser && (
              <div className="mt-2 flex items-center gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-2.5 ring-1 ring-[var(--border)]">
                {mobileUser}
              </div>
            )}
            <nav className="mt-1 flex flex-col" aria-label="Sections">
              {groups.map((g) => (
                <div key={g.label ?? "all"}>
                  {g.label && (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)]">
                      {g.label}
                    </p>
                  )}
                  {g.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={l.active ? "page" : undefined}
                      onClick={close}
                      style={{ touchAction: "manipulation" }}
                      className={`flex h-11 touch-manipulation items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors duration-150 ${
                        l.active ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      {l.icon && (
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-[var(--border)] ${
                            l.active ? "bg-[var(--surface)] text-[var(--accent-text)]" : "bg-[var(--surface-2)] text-[var(--muted)]"
                          }`}
                          aria-hidden="true"
                        >
                          {l.icon}
                        </span>
                      )}
                      <span className="min-w-0 truncate">{l.label}</span>
                      {l.active && (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-text)]" aria-hidden="true" />
                      )}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            {(sheetActions ?? actions) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-2 pb-1 pt-3">
                {sheetActions ?? actions}
              </div>
            )}
            {/* R5 INTEGRATION — sound toggle, mounted in the slot A2 left
                for it. Mobile has no sidebar, so the sheet footer is the
                settings-adjacent surface on phones (the desktop sidebar
                carries the same slot in components/layout.tsx). The two
                instances stay in sync via the upi-sounds-changed event. */}
            <div data-nav-slot="sound-toggle" className="flex items-center px-2">
              <SoundToggle />
            </div>
            <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-3 text-xs text-[var(--faint)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">{time ?? "--:--"} IST</span>
              </span>
              <span>Self-hosted · MIT · ₹0 fees</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
