// Halden nav — Round 6 rebuild (replaces the Axion liquid-glass pill).
//
// FIXED pill, never sticky, never shrinking: position:fixed, z-50,
// top:20px (12px mobile), left/right:var(--gut), height 60px (54px
// mobile). Exception (Round 8): on dashboard pages the pill starts
// after the 256px sidebar (left:calc(256px + var(--gut)) at >=1024px)
// so it no longer covers the sidebar logo. Height, padding and font
// size NEVER change on scroll — the
// Round 5 "niche krte hi chota hota" rule still holds; scrolling only
// drives the CTA morph (see below), never the pill's size.
//
// Structure: #nav (fixed wrapper, carries the `on` class) > .halden-pill
// (the white pill; dark theme: dark glass) + <details> (mobile menu,
// sibling of the pill — a closed <details> hides its non-<summary>
// children, so the pill must NOT be inside it; the sheet/backdrop are
// also outside the pill because its backdrop-filter would become their
// containing block and break their fixed positioning).
//
// The entrance animation lives on the PILL, not on #nav: a transform on
// #nav (or any filter/backdrop-filter) would make #nav the containing
// block for the fixed sheet/backdrop and break them. The pill's own
// transform only affects its descendants (centre links, bell panel),
// which are positioned relative to it anyway.
//
// Centre links are absolutely centred and shown ONLY at >=1280px
// viewport. Measured: the 5 links span ~412px and the right cluster is
// ~350px (CTA on), so the pill needs >=~1112px to fit both without
// overlap; at 1280px the pill is 1134px wide. Below that the menu sheet
// carries the links — an overlap-free nav beats a cramped one. The
// <=820px mobile rule from the spec is satisfied as a subset.
//
// CTA morph (Halden dot-arrow): .navcta starts 42px wide, scale(0),
// margin-left:-42px (zero footprint); the .btn inside is fixed 142px
// wide so only its cyan dot shows through the 42px window. When #nav
// gains `on`, the wrapper scales in, stretches to 142px, and the label
// fades in. `on` is driven by the statement reveal (Worker A: the
// `halden:stmt` CustomEvent with detail {p} — p>.4 turns it on) OR by
// scrolling past the hero on any page, and it is ON from the start on
// non-landing pages (no statement there). If Worker A lands a shared
// module instead, the compute() below also reads window.__haldenStmtP
// defensively. Login loses its right padding while `on`.
//
// Round 9: the CTA renders ONLY for a logged-out landing visitor
// (variant="landing" && !authed). On dashboard pages and for an authed
// user on the landing page the .navcta element is not in the DOM at all
// — the morph above only ever applies to the guest landing case, where
// the CTA points at /setup. (Before Round 9 the CTA was always rendered
// and `shouldShowNavCta` returned true for every non-landing page, so
// it showed on /dashboard, /orders, /settings… pointing at /orders/new.)
//
// Mobile (<=820px): centre links hidden, pill 54px at top:12px, CTA
// margin 8px, Login padding 0 6px, menu button icon-only (32px). At
// 390px the pill is 350px wide and the full right cluster (mark + bell
// + theme + Login + 142px CTA + menu) does not fit, so Login hides
// below 420px — it stays reachable in the menu sheet footer, which
// already carries Login + Get started for guests. Bell + theme stay
// visible at every width; the sound toggle moves into the sheet below
// 820px (its pill instance stays mounted and in sync via
// SOUND_CHANGED_EVENT, the Round 5 pattern).
//
// Mobile menu is the Round 3 <details>/<summary>: it opens on the FIRST
// tap even before hydration. The summary gets an explicit z-index so it
// stays above the backdrop (z-30) and clickable while open.
//
// Colours go only through the semantic theme tokens (var(--text),
// var(--muted), --surface...) except the spec-fixed Halden values:
// pill glass over --nav-bg, ink #0b1d3a, cyan dot #2fe0d0, periwinkle
// #5b7cf0. Round 11: the light pill is liquid glass (translucent
// --nav-bg + blur 20px saturate 1.6 + specular insets + gradient
// border); the dark pill keeps its dark glass, refined to match.
// Link/muted text keeps Round 5 AA contrast in both themes.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
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

/** Centre links (Halden spec, gateway routes) — same on landing and
    dashboard pages; the sheet + sidebar keep the merchant links. */
const HALDEN_LINKS: { href: string; label: string }[] = [
  { href: "/#features", label: "Features" },
  { href: "/#qr", label: "QR methods" },
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Statement progress above which the CTA morphs in on the landing page. */
export const HALDEN_STMT_THRESHOLD = 0.4;
/** Fraction of the viewport the user must scroll before the CTA turns on
    without any statement event (scrolling past the hero). */
export const HALDEN_HERO_SCROLL_FRACTION = 0.8;

/**
 * Pure CTA rule, exported for tests. The CTA ("Get started") is for
 * logged-out landing visitors ONLY: it never renders for an authed user
 * (on the landing page it would point at /orders/new; on dashboard pages
 * it showed unconditionally — Round 9 bug: `!isLanding` returned true,
 * so the CTA was on from the first paint on every app page) and it never
 * renders on a dashboard-variant nav. On the landing page for a guest it
 * turns on once the statement reveal passes the threshold or the user
 * scrolls past the hero; off the landing page for a guest (e.g. /docs)
 * it is on from the first paint (no statement exists there).
 */
export function shouldShowNavCta({
  isLanding,
  stmtP,
  scrollY,
  viewportH,
  authed = false,
}: {
  isLanding: boolean;
  stmtP: number | null;
  scrollY: number;
  viewportH: number;
  /** Logged-in user: the CTA never shows, on any page. */
  authed?: boolean;
}): boolean {
  if (authed) return false;
  if (!isLanding) return true;
  if (stmtP !== null && stmtP > HALDEN_STMT_THRESHOLD) return true;
  if (viewportH > 0 && scrollY > viewportH * HALDEN_HERO_SCROLL_FRACTION) return true;
  return false;
}

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

// All Halden nav CSS lives here (this file owns the nav; globals.css is
// another worker's file). Unlayered <style> beats Tailwind's layered
// utilities, so these rules win over the .btn base where they overlap.
const HALDEN_NAV_CSS = `
#nav{--ease:cubic-bezier(.22,.7,.2,1);--gut:clamp(20px,5.7vw,82px);position:fixed;z-index:50;top:20px;left:var(--gut);right:var(--gut);font-family:var(--font-sans);}
.halden-nav-spacer{height:80px;}
#nav .halden-pill{position:relative;display:flex;align-items:center;height:60px;padding:0 84px 0 22px;border-radius:999px;background:radial-gradient(120% 90% at 12% 0%,rgba(255,255,255,.85),rgba(255,255,255,0) 55%),radial-gradient(120% 90% at 88% 0%,rgba(255,255,255,.5),rgba(255,255,255,0) 50%),radial-gradient(140% 120% at 50% 115%,rgba(11,29,58,.06),rgba(11,29,58,0) 55%),var(--nav-bg);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 -1px 0 rgba(11,29,58,.06),0 1px 0 rgba(11,29,58,.04),0 10px 30px -18px rgba(11,29,58,.25);animation:navin .9s cubic-bezier(.22,.7,.2,1) .15s both;}
/* Round 11: liquid glass — the light pill is now translucent
   (var(--nav-bg) = rgba(255,255,255,.72)) with blur + saturate, a
   specular top edge / bottom shade, edge-refraction radial gradients
   in the background stack (painted under the text, so they can never
   hurt readability), and the thin gradient border via the same
   mask-composite ring .liquid-glass uses. Height, padding, top offset
   and the CTA morph are untouched. */
#nav .halden-pill::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.85),rgba(255,255,255,.12) 40%,rgba(11,29,58,.08) 75%,rgba(255,255,255,.4));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;}
@keyframes navin{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
html.dark #nav .halden-pill{background:radial-gradient(120% 90% at 12% 0%,rgba(255,255,255,.16),rgba(255,255,255,0) 55%),radial-gradient(120% 90% at 88% 0%,rgba(255,255,255,.09),rgba(255,255,255,0) 50%),radial-gradient(140% 120% at 50% 115%,rgba(0,0,0,.28),rgba(0,0,0,0) 55%),var(--nav-bg);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -1px 0 rgba(0,0,0,.3),0 1px 0 rgba(255,255,255,.07),0 10px 30px -18px rgba(0,0,0,.65);}
html.dark #nav .halden-pill::before{background:linear-gradient(135deg,rgba(255,255,255,.28),rgba(255,255,255,.06) 40%,rgba(0,0,0,.2) 75%,rgba(255,255,255,.14));}
/* Round 11: real refraction — an SVG feTurbulence + feDisplacementMap
   filter (defined inline in the JSX below) applied to the BACKDROP
   only, via backdrop-filter:url(). Chrome 158 honours url() in
   backdrop-filter (CSS.supports returns true), so the displacement
   applies in Chrome and Firefox; Safari still fails this @supports
   test and keeps the blur-only rule above, so the blur is never lost.
   The displacement (scale 6) bends only the backdrop — the pill's text
   is never displaced. The dark pill keeps blur-only (its
   higher-specificity rule wins) — adding displacement there is a
   follow-up, not part of this round. No animation, so no reduced-motion
   handling needed. */
@supports (backdrop-filter:url(#nav-liquid-refract)){#nav .halden-pill{backdrop-filter:url(#nav-liquid-refract) blur(20px) saturate(1.6);}}
/* Round 11: mobile sheet edge treatment — the sheet is the scroll
   container, so a ::before gradient ring would scroll with its content;
   the edge is refined with inset highlights + a soft 1px inset ring
   instead (same specular language as the pill). Sheet mechanics,
   backdrop and <details> behaviour are untouched. */
#nav .nav-sheet{box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 -1px 0 rgba(0,0,0,.05),inset 0 0 0 1px rgba(255,255,255,.28),var(--shadow);}
html.dark #nav .nav-sheet{box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.3),inset 0 0 0 1px rgba(255,255,255,.1),var(--shadow);}
#nav .halden-brand{display:flex;flex:none;align-items:center;gap:9px;color:var(--text);text-decoration:none;}
#nav .halden-brand-name{font-size:17px;font-weight:500;letter-spacing:-.02em;color:var(--text);white-space:nowrap;}
#nav .halden-centre{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;align-items:center;gap:31px;}
#nav .halden-centre a{font-size:14px;font-weight:500;letter-spacing:-.005em;color:var(--muted);opacity:.92;text-decoration:none;white-space:nowrap;transition:opacity .2s;}
#nav .halden-centre a:hover{opacity:.55;}
#nav .halden-right{display:flex;flex:none;align-items:center;gap:8px;margin-left:auto;}
#nav .halden-sound-pill{display:flex;align-items:center;}
#nav .nav-login{font-size:14px;font-weight:500;line-height:42px;color:var(--text);padding:0 14px;text-decoration:none;white-space:nowrap;}
#nav.on .nav-login{padding-right:0;}
#nav .navcta{flex:none;width:42px;height:42px;overflow:hidden;border-radius:999px;margin-left:-42px;transform:scale(0);transform-origin:100% 50%;transition:transform .35s var(--ease),width .65s var(--ease) .22s,margin .35s var(--ease);}
#nav .navcta .navcta-btn{display:flex;align-items:center;gap:10px;width:142px;height:42px;padding:0 16px 0 14px;border-radius:999px;background:#0b1d3a;color:#fff;text-decoration:none;white-space:nowrap;}
#nav .navcta .dot{flex:none;display:grid;place-items:center;width:10px;height:10px;border-radius:999px;background:#2fe0d0;box-shadow:0 0 12px rgba(47,224,208,.8);transition:width .25s var(--ease),height .25s var(--ease);}
#nav .navcta .dot svg{width:14px;height:14px;opacity:0;transition:opacity .2s;}
#nav .navcta .navcta-btn:hover .dot{width:32px;height:32px;}
#nav .navcta .navcta-btn:hover .dot svg{opacity:1;}
#nav .navcta .lbl{flex:1;text-align:center;font-size:14px;font-weight:500;letter-spacing:-.005em;color:#fff;opacity:0;transition:opacity .4s var(--ease) .45s;}
#nav.on .navcta{width:142px;margin-left:16px;transform:scale(1);}
#nav.on .navcta .lbl{opacity:1;}
#nav details[data-sheet]{display:block;}
#nav details[data-sheet]>summary{z-index:60;}
@media (min-width:1280px){
  #nav .halden-centre{display:flex;}
  #nav .halden-pill{padding-right:10px;}
  #nav details[data-sheet]{display:none;}
}
@media (min-width:1024px){
  /* Round 8: on dashboard pages the fixed pill spans the full viewport
     (left/right:var(--gut)) and covers the sidebar logo — at 1280px
     only "UG UP" peeked out from behind the pill (pre-existing, seen
     in before/after shots alike). The desktop sidebar is 256px wide
     (w-64, lg:flex in components/layout.tsx), so start the dashboard
     pill after it; the pill then spans exactly the content column.
     Landing pages (variant="landing", no sidebar) are untouched. The
     mobile sheet/backdrop are fixed viewport-relative, so the shift
     does not move them; the menu summary stays inside the pill.
     Narrowing the pill costs ~256px, which at 1280px squeezes the
     centre links into the right cluster ("Dashboard" hid behind the
     avatar). The pill brand duplicates the sidebar logo (same mark,
     same home link), so hide it on dashboard pages once the centre
     links appear (>=1280px): that frees ~170px. It is still not
     enough at 1280px (30px overlap remained), so the centre links
     themselves hide on dashboard pages below 1440px — see the rule
     below. Below 1280px the centre links are hidden anyway, so the
     brand stays. */
  #nav[data-variant="dashboard"]{left:calc(256px + var(--gut));}
}
@media (min-width:1280px){
  #nav[data-variant="dashboard"] .halden-brand{display:none;}
}
@media (min-width:1280px) and (max-width:1439px){
  /* Round 8 (nav fix, third half): even with the brand hidden, the
     narrowed dashboard pill is too tight at 1280px — the centre links
     overlapped the right cluster by 30px (measured: centre.right=937,
     right.left=907). The sidebar already carries Dashboard + Docs, and
     Features / QR methods are landing-page anchors, so hide the centre
     links on dashboard pages below 1440px. They return at >=1440px,
     where the pill is wide enough (measured clearance there). Landing
     pages keep their centre links at every width >=1280px. */
  #nav[data-variant="dashboard"] .halden-centre{display:none;}
}
@media (max-width:820px){
  #nav{top:12px;}
  .halden-nav-spacer{height:66px;}
  #nav .halden-pill{height:54px;padding:0 44px 0 12px;}
  #nav .halden-right{gap:4px;}
  #nav .halden-sound-pill{display:none;}
  #nav .nav-login{padding:0 6px;}
  #nav.on .navcta{margin-left:8px;}
  #nav .nav-menu-label{display:none;}
  #nav .nav-menu-btn{width:32px;height:32px;min-height:32px;padding:0;justify-content:center;}
}
@media (max-width:419px){
  #nav .halden-brand-name{display:none;}
  #nav .nav-login{display:none;}
}
`;

export function LiquidNav({
  variant,
  links,
  actions,
  sheetActions,
  mobileUser,
  showBell = false,
  authed = false,
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
  /** Show the notification bell in the pill (authed users only — it
      polls an authed endpoint). Landing guests never get it. */
  showBell?: boolean;
  /** Logged-in user: the pill shows no Login link and no "Get started"
      CTA (the CTA is for logged-out landing visitors only — Round 9:
      it used to render on every dashboard page pointing at /orders/new).
      The dashboard nav is reached through the centre links / sidebar. */
  authed?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const pathname = usePathname() ?? "/";
  const isLanding = pathname === "/";
  // Round 9: the CTA renders ONLY for a logged-out visitor on the
  // landing variant. Gated at render (not CSS-hidden) so it is never in
  // the DOM — and never focusable/clickable — on dashboard pages or for
  // an authed user on the landing page. PublicNav passes variant
  // "landing" + authed for a signed-in visitor; AppShell passes variant
  // "dashboard" + authed for every app page.
  const showCta = variant === "landing" && !authed;
  // Non-landing pages: CTA on from the first paint (no statement there).
  // Landing: off until the statement reveal or a past-hero scroll.
  // Authed: always off (see shouldShowNavCta).
  const [ctaOn, setCtaOn] = useState(showCta && !isLanding);
  const groups = groupLinks(links);
  // The only rendered case is a guest on the landing page, so the CTA
  // always points at /setup (first-run admin creation).
  const ctaHref = "/setup";

  useEffect(() => {
    let stmtP: number | null = null;
    const compute = () => {
      // Defensive read: if Worker A lands a shared module/global instead
      // of (or in addition to) the event, honour it too.
      const globalP = (window as unknown as { __haldenStmtP?: unknown }).__haldenStmtP;
      const p = stmtP ?? (typeof globalP === "number" ? globalP : null);
      setCtaOn(
        shouldShowNavCta({
          isLanding,
          stmtP: p,
          scrollY: window.scrollY,
          viewportH: window.innerHeight,
          authed,
        }),
      );
    };
    const onStmt = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const p = typeof d === "number" ? d : typeof d?.p === "number" ? d.p : null;
      if (p !== null) {
        stmtP = p;
        compute();
      }
    };
    window.addEventListener("halden:stmt", onStmt as EventListener);
    window.addEventListener("scroll", compute, { passive: true });
    compute();
    return () => {
      window.removeEventListener("halden:stmt", onStmt as EventListener);
      window.removeEventListener("scroll", compute);
    };
  }, [isLanding, authed]);

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
    <>
      <style>{HALDEN_NAV_CSS}</style>
      {/* In-flow spacer: the pill is fixed, so without this the page
          content would jump up ~80px under it. Matches the pill's
          top offset + height (20+60 desktop, 12+54 mobile). */}
      <div className="halden-nav-spacer" aria-hidden="true" />
      <div id="nav" data-testid="halden-nav" data-variant={variant} className={ctaOn ? "on" : undefined}>
        {/* Round 11: refraction filter for the pill backdrop only (see
            the @supports rule in HALDEN_NAV_CSS). Zero-size, absolutely
            positioned — no layout impact, and no filter/backdrop-filter
            ever lands on #nav itself (see header note). */}
        <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter id="nav-liquid-refract" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        <div data-testid="liquid-nav-pill" className="halden-pill">
          <Link href="/" className="halden-brand touch-manipulation" aria-label="UPI Gateway — home">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="11" fill="#5b7cf0" />
              <path d="M5 10.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M5 14.2c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="halden-brand-name">UPI Gateway</span>
          </Link>

          <nav className="halden-centre" aria-label="Primary">
            {HALDEN_LINKS.map((l) => (
              <Link key={l.href} href={l.href} style={{ touchAction: "manipulation" }}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="halden-right">
            {/* Notification bell — authed users only (see showBell). One
                mounted instance; the sheet never duplicates it. */}
            {showBell && (
              <div data-nav-slot="notifications" className="flex items-center">
                <NotificationBell />
              </div>
            )}
            {/* Sound toggle in the pill on desktop; below 820px this
                instance hides and the sheet footer instance (same sync
                event) is the reachable one. */}
            <div data-nav-slot="sound-toggle" className="halden-sound-pill">
              <SoundToggle />
            </div>
            <ThemeToggle />
            {variant === "landing" && !authed && (
              <Link href="/login" className="nav-login touch-manipulation" style={{ touchAction: "manipulation" }}>
                Login
              </Link>
            )}
            {/* Round 9: rendered ONLY for a logged-out landing visitor.
                On dashboard pages and for authed users the element is
                absent from the DOM entirely (not CSS-hidden), so it can
                never be tabbed to or clicked there. */}
            {showCta && (
              <div className="navcta" data-testid="nav-cta">
                <Link
                  href={ctaHref}
                  className="navcta-btn touch-manipulation"
                  tabIndex={ctaOn ? 0 : -1}
                  aria-label="Get started"
                  style={{ touchAction: "manipulation" }}
                >
                  <span className="dot" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0b1d3a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                  <span className="lbl">Get started</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu — <details> is a sibling of the pill (see header
            note). Its <summary> is the direct first child, absolutely
            positioned into the pill's reserved right end; the backdrop and
            bottom sheet are fixed, viewport-relative, and hidden by the
            closed <details> until the first tap opens them. */}
        <details ref={detailsRef} data-sheet className="group">
          <summary
            aria-expanded={open}
            aria-label="Menu"
            style={{ touchAction: "manipulation" }}
            className="nav-menu-btn btn btn-secondary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2 touch-manipulation list-none select-none [&::-webkit-details-marker]:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg viewBox="0 0 24 24" className="hidden h-4 w-4 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <span className="nav-menu-label">Menu</span>
          </summary>

          {/* Backdrop — below the pill/summary (z-30 < summary z-60) so
              the Menu/X summary stays clickable; click closes (JS
              enhancement only). */}
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
            {/* Sound toggle, mounted in the slot A2 left for it. Mobile
                has no sidebar, so the sheet footer is the reachable
                surface on phones (the desktop sidebar carries the same
                slot in components/layout.tsx). The instances stay in sync
                via the upi-sounds-changed event. */}
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
    </>
  );
}
