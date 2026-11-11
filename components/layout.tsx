// Layouts — public nav + footer, authed sidebar shell, guest shell.
// Ledger direction: flat logo mark (₹ in solid indigo, 8px radius), sentence
// case, hairlines, active state = small surface step + hairline.
import Link from "next/link";
import type { SessionUser } from "./server-data";
import { Avatar, Icon, ICONS } from "./ui";
import { LogoutButton, MobileMenu } from "./layout-client";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-base font-medium text-white" aria-hidden="true">₹</span>
      <span className="text-base font-medium text-slate-50">UPI Gateway</span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Self-hosted UPI payments for Indian merchants. Money goes directly to the merchant&apos;s bank account — the gateway never holds funds.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-slate-400">
            <Link href="/#features" className="hover:text-slate-100">Features</Link>
            <Link href="/#how" className="hover:text-slate-100">How it works</Link>
            <Link href="/#security" className="hover:text-slate-100">Security</Link>
            <Link href="/docs" className="hover:text-slate-100">API docs</Link>
            <Link href="/login" className="hover:text-slate-100">Log in</Link>
            <Link href="/setup" className="hover:text-slate-100">Setup</Link>
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-white/5 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 UPI Gateway · MIT License</p>
          <p>Developed by Mohit 🩷</p>
        </div>
      </div>
    </footer>
  );
}

const PUBLIC_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#security", label: "Security" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/docs", label: "API docs" },
];

export function PublicNav({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex" aria-label="Primary">
          {PUBLIC_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors duration-150 hover:text-slate-100">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/dashboard" className="btn btn-secondary btn-sm">Dashboard</Link>
              <LogoutButton compact />
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-medium text-slate-400 transition-colors duration-150 hover:text-slate-100 sm:block">Log in</Link>
              <Link href="/setup" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
          <MobileMenu links={PUBLIC_LINKS} />
        </div>
      </div>
    </header>
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
          className={`navlink ${active === l.href ? "navlink-active" : ""}`}>
          <Icon d={l.icon} />{l.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  user, active, title, subtitle, children, actions,
}: {
  user: SessionUser; active: string; title: string; subtitle?: string;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const isAdmin = user.role === "admin";
  const allLinks = isAdmin ? [...MERCHANT_LINKS, ...ADMIN_LINKS] : MERCHANT_LINKS;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 px-4 py-5 lg:flex">
        <Logo />
        <div className="mt-8">
          <p className="mb-2 px-3 text-xs font-medium text-slate-500">Merchant</p>
          <NavList links={MERCHANT_LINKS} active={active} />
        </div>
        {isAdmin && (
          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-medium text-slate-500">Admin</p>
            <NavList links={ADMIN_LINKS} active={active} />
          </div>
        )}
        <div className="mt-auto pt-8">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-3 ring-1 ring-white/10">
            <Avatar name={user.businessName ?? user.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-100">{user.businessName ?? user.name}</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
              <div className="mt-0.5 font-mono text-xs text-brand-400">{user.role}</div>
            </div>
          </div>
          <div className="mt-3 px-1"><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="lg:hidden"><Logo /></div>
            <div className="hidden min-w-0 lg:block">
              <span className="truncate text-sm text-slate-400">{user.businessName ?? user.name}</span>
              <span className="ml-2 font-mono text-xs text-slate-500">{user.role}</span>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <MobileMenu links={allLinks.map(({ href, label }) => ({ href, label }))} active={active} />
            </div>
            <div className="hidden items-center gap-3 lg:flex">
              <Avatar name={user.businessName ?? user.name} className="h-8 w-8 text-xs" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="animate-rise mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-medium text-slate-50 sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
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
            <p className="mt-4 text-sm text-slate-500">Accept UPI payments straight into your bank account.</p>
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-medium text-slate-50">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-600">
            UPI Gateway · MIT License · Developed by Mohit 🩷
          </p>
        </div>
      </div>
    </div>
  );
}
