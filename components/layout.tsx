// Layouts — public nav + footer, authed sidebar shell, guest shell.
// Axion direction (Round 4): light #EFEFEF base + dark Meridian navy
// under `html.dark`, system type, liquid-glass pill nav (LiquidNav owns
// the scroll state and the mobile bottom sheet). Round 5: LiquidNav has a
// FIXED height (60px mobile / 64px desktop, never shrinks on scroll) and
// the mobile sheet is grouped with lucide icons + a user chip; the
// dashboard links carry lucide icons + Merchant/Admin groups via
// LUCIDE_FOR below. All colours go through the --bg/--surface/--text/
// --muted/--border vars in globals.css.
import Link from "next/link";
import type { SessionUser } from "./server-data";
import { Avatar, Icon, ICONS } from "./ui";
import { LogoutButton } from "./layout-client";
import { SoundToggle } from "./sound-toggle";
import { LiquidNav, type LiquidNavLink } from "./liquid-nav";
import {
  BookOpen,
  Bug,
  CreditCard,
  FlaskConical,
  IndianRupee,
  Info,
  LayoutDashboard,
  ListOrdered,
  MessagesSquare,
  Plus,
  QrCode,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export function Logo() {
  return (
    <Link href="/" className="flex touch-manipulation items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--text)] font-display text-[13px] font-semibold text-[var(--bg)] ring-1 ring-[var(--border)]" aria-hidden="true">UG</span>
      <span className="font-display text-base font-semibold text-[var(--text)]">UPI Gateway</span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Self-hosted UPI payments for Indian merchants. Money goes directly to the merchant&apos;s bank account — the gateway never holds funds.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-[var(--muted)]">
            <Link href="/#features" className="touch-manipulation hover:text-[var(--text)]">Features</Link>
            <Link href="/#how" className="touch-manipulation hover:text-[var(--text)]">How it works</Link>
            <Link href="/#qr" className="touch-manipulation hover:text-[var(--text)]">QR methods</Link>
            <Link href="/#security" className="touch-manipulation hover:text-[var(--text)]">Security</Link>
            <Link href="/docs" className="touch-manipulation hover:text-[var(--text)]">API docs</Link>
            <Link href="/login" className="touch-manipulation hover:text-[var(--text)]">Log in</Link>
            <Link href="/setup" className="touch-manipulation hover:text-[var(--text)]">Setup</Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 UPI Gateway · MIT License</p>
          <p>Developed by Mohit 🩷</p>
        </div>
      </div>
    </footer>
  );
}

const PUBLIC_LINKS: LiquidNavLink[] = [
  { href: "/#how", label: "How it works", group: "Explore", icon: <Info className="h-4 w-4" aria-hidden="true" /> },
  { href: "/#qr", label: "QR methods", group: "Explore", icon: <QrCode className="h-4 w-4" aria-hidden="true" /> },
  { href: "/#features", label: "Features", group: "Explore", icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
  { href: "/#pricing", label: "Pricing", group: "Explore", icon: <IndianRupee className="h-4 w-4" aria-hidden="true" /> },
  { href: "/#faq", label: "FAQ", group: "Explore", icon: <MessagesSquare className="h-4 w-4" aria-hidden="true" /> },
  { href: "/docs", label: "Docs", group: "Explore", icon: <BookOpen className="h-4 w-4" aria-hidden="true" /> },
];

export function PublicNav({ user }: { user: SessionUser | null }) {
  return (
    <LiquidNav
      variant="landing"
      links={PUBLIC_LINKS}
      // Round 6 (Halden): bell only for authed users (it polls an authed
      // endpoint); authed users get no Login link and a /orders/new CTA.
      showBell={user !== null}
      authed={user !== null}
      actions={
        user ? (
          <>
            <Link href="/dashboard" className="btn btn-secondary btn-sm touch-manipulation">Dashboard</Link>
            <LogoutButton compact />
          </>
        ) : (
          <>
            {/* Round 6: `actions` now renders ONLY in the mobile sheet
                footer (the pill renders its own Login link, which hides
                below 420px) — so the sheet Login must NOT carry the old
                `hidden sm:block` (at 390px it would be reachable nowhere). */}
            <Link href="/login" className="text-sm font-medium text-[var(--muted)] transition-colors duration-150 hover:text-[var(--text)] touch-manipulation">Log in</Link>
            <Link href="/setup" className="btn btn-accent btn-sm touch-manipulation">Get started</Link>
          </>
        )
      }
    />
  );
}

const MERCHANT_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
  { href: "/orders", label: "Orders", icon: ICONS.orders },
  { href: "/orders/new", label: "New payment link", icon: ICONS.plus },
  { href: "/accounts", label: "Payment accounts", icon: ICONS.accounts },
  { href: "/settings", label: "API and webhooks", icon: ICONS.settings },
  { href: "/sandbox", label: "Sandbox", icon: ICONS.sandbox },
  { href: "/docs", label: "Docs", icon: ICONS.docs },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin", icon: ICONS.admin },
  { href: "/admin/merchants", label: "Merchants", icon: ICONS.merchants },
  { href: "/admin/orders", label: "All orders", icon: ICONS.orders },
  { href: "/admin/accounts", label: "All accounts", icon: ICONS.accounts },
  { href: "/admin/webhooks", label: "Webhooks", icon: ICONS.webhooks },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ICONS.audit },
  { href: "/admin/transaction-debugger", label: "Transaction debugger", icon: ICONS.debug },
];

function NavList({ links, active }: { links: { href: string; label: string; icon: string }[]; active: string }) {
  return (
    <nav className="space-y-0.5" aria-label="Sections">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active === l.href ? "page" : undefined}
          className={`navlink touch-manipulation ${active === l.href ? "navlink-active" : ""}`}>
          <Icon d={l.icon} />{l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Lucide icons for the mobile sheet (the sidebar above uses the ICONS
    path strings instead). One icon per dashboard route; unknown routes
    simply get no icon. */
const LUCIDE_FOR: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/orders": ListOrdered,
  "/orders/new": Plus,
  "/accounts": CreditCard,
  "/settings": Settings,
  "/sandbox": FlaskConical,
  "/docs": BookOpen,
  "/admin": ShieldCheck,
  "/admin/merchants": Users,
  "/admin/orders": ListOrdered,
  "/admin/accounts": CreditCard,
  "/admin/webhooks": Webhook,
  "/admin/audit-logs": ScrollText,
  "/admin/transaction-debugger": Bug,
};

function toNavLink(
  l: { href: string; label: string },
  group: string,
  active: string,
): LiquidNavLink {
  const I = LUCIDE_FOR[l.href];
  return {
    href: l.href,
    label: l.label,
    active: active === l.href,
    group,
    icon: I ? <I className="h-4 w-4" aria-hidden="true" /> : undefined,
  };
}

export function AppShell({
  user, active, title, subtitle, children, actions,
}: {
  user: SessionUser; active: string; title: string; subtitle?: string;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 lg:flex">
        <Logo />
        <div className="mt-8">
          <p className="mb-2 px-3 text-xs font-medium text-[var(--faint)]">Merchant</p>
          <NavList links={MERCHANT_LINKS} active={active} />
        </div>
        {isAdmin && (
          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-medium text-[var(--faint)]">Admin</p>
            <NavList links={ADMIN_LINKS} active={active} />
          </div>
        )}
        <div className="mt-auto pt-8">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] px-3 py-3 ring-1 ring-[var(--border)]">
            <Avatar name={user.businessName ?? user.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-[var(--text)]">{user.businessName ?? user.name}</div>
              <div className="truncate text-xs text-[var(--muted)]">{user.email}</div>
              <div className="mt-0.5 font-mono text-xs text-[var(--accent-text)]">{user.role}</div>
            </div>
          </div>
          {/* R5 INTEGRATION — sound toggle, mounted in the slot A2 left
              for it (settings area, desktop sidebar). The mobile sheet
              carries the same slot (see liquid-nav.tsx); the two instances
              stay in sync via the upi-sounds-changed event. */}
          <div data-nav-slot="sound-toggle" className="mt-3 flex items-center px-1">
            <span className="text-xs text-[var(--muted)]">Payment sounds</span>
            <span className="ml-auto"><SoundToggle /></span>
          </div>
          <div className="mt-3 px-1"><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <LiquidNav
          variant="dashboard"
          showBell
          authed
          links={[
            ...MERCHANT_LINKS.map((l) => toNavLink(l, "Merchant", active)),
            ...(isAdmin ? ADMIN_LINKS.map((l) => toNavLink(l, "Admin", active)) : []),
          ]}
          actions={
            <>
              <Avatar name={user.businessName ?? user.name} className="h-8 w-8 text-xs" />
              <LogoutButton compact />
            </>
          }
          sheetActions={<LogoutButton compact />}
          mobileUser={
            <>
              <Avatar name={user.businessName ?? user.name} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--text)]">{user.businessName ?? user.name}</div>
                <div className="truncate text-xs text-[var(--muted)]">{user.email}</div>
                <div className="font-mono text-xs text-[var(--accent-text)]">{user.role}</div>
              </div>
            </>
          }
        />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="animate-rise mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-medium text-[var(--text)] sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function GuestShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-rise w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo />
            <p className="mt-4 text-sm text-[var(--muted)]">Accept UPI payments straight into your bank account.</p>
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-medium text-[var(--text)]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-xs text-[var(--faint)]">
            UPI Gateway · MIT License · Developed by Mohit 🩷
          </p>
        </div>
      </div>
    </div>
  );
}
