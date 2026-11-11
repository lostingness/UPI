// Layouts — ported from layouts/app.blade.php (authed sidebar + topbar),
// layouts/guest.blade.php (auth pages) and layouts/public-nav.blade.php.
import Link from "next/link";
import type { SessionUser } from "./server-data";
import { Avatar } from "./ui";
import { LogoutButton } from "./layout-client";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-base font-black text-white">₹</span>
      <span className={`text-base font-bold tracking-tight ${dark ? "text-slate-50" : "text-slate-50"}`}>
        UPI Gateway
      </span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800/80 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-xs text-slate-500 sm:flex-row sm:justify-between sm:text-left">
        <p>© 2026 UPI Gateway · MIT License. Payments go directly to the merchant&apos;s bank account via UPI — the gateway never holds your funds.</p>
        <nav className="flex gap-4">
          <Link href="/docs" className="hover:text-slate-300">API Docs</Link>
          <Link href="/login" className="hover:text-slate-300">Log in</Link>
          <Link href="/setup" className="hover:text-slate-300">Setup</Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicNav({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-400 md:flex">
          <a href="/#features" className="hover:text-slate-100">Features</a>
          <a href="/#how" className="hover:text-slate-100">How it works</a>
          <a href="/#pricing" className="hover:text-slate-100">Pricing</a>
          <Link href="/docs" className="hover:text-slate-100">API Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href="/dashboard" className="btn btn-secondary btn-sm">Dashboard</Link>
              <LogoutButton compact />
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link href="/setup" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const MERCHANT_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/orders/new", label: "New payment link" },
  { href: "/accounts", label: "Payment accounts" },
  { href: "/settings", label: "API & Webhooks" },
  { href: "/sandbox", label: "Sandbox" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/orders", label: "All orders" },
  { href: "/admin/accounts", label: "All accounts" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit-logs", label: "Audit logs" },
  { href: "/admin/transaction-debugger", label: "Transaction debugger" },
];

export function AppShell({
  user, active, title, subtitle, children, actions,
}: {
  user: SessionUser; active: string; title: string; subtitle?: string;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const links = user.role === "admin" ? [...MERCHANT_LINKS, ...ADMIN_LINKS] : MERCHANT_LINKS;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/80 px-4 py-5 lg:flex">
        <Logo />
        <nav className="mt-8 space-y-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`navlink ${active === l.href ? "navlink-active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-3 ring-1 ring-slate-800">
            <Avatar name={user.businessName ?? user.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">{user.businessName ?? user.name}</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-400">{user.role}</div>
            </div>
          </div>
          <div className="mt-3 px-1"><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="lg:hidden"><Logo /></div>
            <nav className="flex gap-1 overflow-x-auto text-sm lg:hidden">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium ${active === l.href ? "bg-slate-800 text-slate-100" : "text-slate-400"}`}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="hidden items-center gap-3 lg:flex">
              <span className="text-sm text-slate-400">{user.name}</span>
              <Avatar name={user.businessName ?? user.name} className="h-8 w-8 text-xs" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">{title}</h1>
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
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo />
            <p className="mt-4 text-sm text-slate-500">Accept UPI payments straight into your bank account.</p>
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-xl font-bold tracking-tight text-slate-50">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-600">
            UPI Gateway · MIT License · Payments go directly to the merchant&apos;s bank account.
          </p>
        </div>
      </div>
    </div>
  );
}
