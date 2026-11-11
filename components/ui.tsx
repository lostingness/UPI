// Shared server-safe UI helpers (formatting, status pills, cards, empty states).
// Dark theme, ported from the Laravel Blade components (x-status, x-empty,
// x-avatar, x-copy) and the Tailwind component classes in resources/css/app.css.

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
  paid: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  review: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  expired: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  failed: "bg-red-500/15 text-red-300 ring-red-500/30",
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  disabled: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  delivered: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  blocked: "bg-red-500/15 text-red-300 ring-red-500/30",
  sandbox: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style}`}>
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
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600/20 font-bold text-brand-300 ring-1 ring-brand-500/30 ${className}`}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-800 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 truncate text-xl font-bold tracking-tight text-slate-50 tabular-nums sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function DbNotConfigured({ context }: { context?: string }) {
  return (
    <div className="card border-amber-500/30 p-6">
      <h2 className="text-base font-semibold text-amber-300">Database not configured</h2>
      <p className="mt-2 text-sm text-slate-400">
        {context ?? "This page needs the database."} Set the Neon pooled{" "}
        <code className="kbd">DATABASE_URL</code> environment variable and run{" "}
        <code className="kbd">npm run migrate</code> (see <code className="kbd">db/README.md</code>).
        Nothing here is faked — no orders, accounts or settings can be shown until the database is connected.
      </p>
      <p className="mt-3 text-sm">
        <a href="/setup" className="font-semibold text-brand-400 hover:text-brand-300">Go to Setup →</a>
        {" · "}
        <a href="/api/health" className="font-semibold text-brand-400 hover:text-brand-300">Check /api/health</a>
      </p>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="card border-red-500/30 p-6">
      <h2 className="text-base font-semibold text-red-300">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
      <p className="mt-3 text-sm"><a href="/dashboard" className="font-semibold text-brand-400 hover:text-brand-300">Back to dashboard →</a></p>
    </div>
  );
}
