// Shared server-safe UI helpers (formatting, status, cards, empty states).
// Ledger direction: mono figures, one format (₹ with 2dp), sentence case,
// quiet status text — no glowing pills, no icons stuffed into stat cards.

export function inr(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const istDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
});
const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : istDate.format(d);
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : istDateTime.format(d) + " IST";
}

export type OrderStatus = "pending" | "paid" | "expired" | "review" | "failed";

const STATUS_STYLE: Record<string, string> = {
  paid: "text-emerald-300",
  pending: "text-amber-300",
  review: "text-sky-300",
  expired: "text-slate-400",
  failed: "text-red-300",
  active: "text-emerald-300",
  disabled: "text-slate-400",
  delivered: "text-emerald-300",
  blocked: "text-red-300",
  sandbox: "text-amber-300",
  live: "text-emerald-300",
};

const STATUS_DOT: Record<string, string> = {
  paid: "bg-emerald-400", pending: "bg-amber-400", review: "bg-sky-400",
  expired: "bg-slate-500", failed: "bg-red-400", active: "bg-emerald-400",
  disabled: "bg-slate-500", delivered: "bg-emerald-400", blocked: "bg-red-400",
  sandbox: "bg-amber-400", live: "bg-emerald-400",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  const dot = STATUS_DOT[status] ?? STATUS_DOT.expired;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label ?? status}
    </span>
  );
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, className = "h-10 w-10 text-sm" }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600/20 font-medium text-brand-300 ring-1 ring-brand-500/30 ${className}`}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-800 text-slate-400 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-medium text-slate-50 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Stat card: label, big figure, change vs a stated reference. No sparklines,
    mini-bars or icons — the number is the content. */
export function StatCard({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 truncate font-mono text-xl font-medium text-slate-50 tabular-nums sm:text-2xl">
        {children ?? value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function DbNotConfigured({ context }: { context?: string }) {
  return (
    <div className="card border-amber-500/30 p-6">
      <h2 className="text-base font-medium text-amber-300">Database not configured</h2>
      <p className="mt-2 text-sm text-slate-400">
        {context ?? "This page needs the database."} Set the Neon pooled{" "}
        <code className="kbd">DATABASE_URL</code> environment variable and run{" "}
        <code className="kbd">npm run migrate</code> (see <code className="kbd">db/README.md</code>).
        Nothing here is faked — no orders, accounts or settings can be shown until the database is connected.
      </p>
      <p className="mt-3 text-sm">
        <a href="/setup" className="font-medium text-brand-400 hover:text-brand-300">Go to setup</a>
        {" · "}
        <a href="/api/health" className="font-medium text-brand-400 hover:text-brand-300">Check /api/health</a>
      </p>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="card border-red-500/30 p-6">
      <h2 className="text-base font-medium text-red-300">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <p className="mt-3 text-sm"><a href="/dashboard" className="font-medium text-brand-400 hover:text-brand-300">Back to dashboard</a></p>
    </div>
  );
}

/** 16px line icon, 1.5 stroke, text-role colour. One set for the whole UI. */
export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  dashboard: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  orders: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  plus: "M12 5v14M5 12h14",
  accounts: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z",
  sandbox: "M9 3h6M10 3v5.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V3",
  admin: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z",
  merchants: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  webhooks: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  audit: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  debug: "M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19",
  docs: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  check: "m5 12.5 4.5 4.5L19 7.5",
  warn: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
} as const;
