import type { CSSProperties } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { AnimatedCount, AnimatedMoney } from "@/components/layout-client";
import { DbNotConfigured, StatCard, inr } from "@/components/ui";
import { OrdersTable } from "@/components/orders-table";
import { dbConfigured, getDashboard, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

function WeekChart({ rows }: { rows: { date: string; amount: number; count: number }[] }) {
  const W = 640, H = 280, padL = 8, padB = 28, padT = 16;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  const bw = (W - padL * 2) / rows.length;
  const barW = Math.min(36, bw * 0.55);
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / max);
  const grid = [0, 0.5, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full" role="img" aria-label="Paid volume, last 7 days">
      {grid.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padL} y1={y(max * g)} y2={y(max * g)} stroke="rgb(255 255 255 / 0.06)" strokeWidth="1" />
          <text x={W - padL} y={y(max * g) - 4} textAnchor="end" className="fill-slate-500" fontSize="11" fontFamily="JetBrains Mono, monospace">{inr(max * g)}</text>
        </g>
      ))}
      {rows.map((row, i) => {
        const x = padL + i * bw + (bw - barW) / 2;
        const isMax = row.amount === max && row.amount > 0;
        return (
          <g key={row.date}>
            <rect x={x} y={y(row.amount)} width={barW} height={Math.max(0, H - padB - y(row.amount))}
              rx="4" fill={isMax ? "#f93f28" : "#334155"} />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-slate-500" fontSize="11" fontFamily="JetBrains Mono, monospace">
              {row.date}
            </text>
            {row.amount > 0 && (
              <text x={x + barW / 2} y={y(row.amount) - 6} textAnchor="middle" className={isMax ? "fill-[#f2b380]" : "fill-slate-400"} fontSize="11" fontFamily="JetBrains Mono, monospace">
                {row.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ environment?: string }> }) {
  const sp = await searchParams;
  const environment = sp.environment === "sandbox" ? "sandbox" : "live";
  const session = await getSessionSafe();
  const user = requireUser(session, "/dashboard");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/dashboard" title="Dashboard" subtitle="Live payments.">
        <DbNotConfigured context="The dashboard needs the database." />
      </AppShell>
    );
  }
  const d = await getDashboard(user.id, environment);
  const successRate = d.successRate === null ? "—" : `${Math.round(d.successRate * 100)}%`;
  const done = d.checklist.filter((c) => c.done).length;

  return (
    <AppShell
      user={user} active="/dashboard" title="Dashboard"
      subtitle={environment === "sandbox" ? "Sandbox data — no real money, no provider is contacted." : "Live payments."}
      actions={
        <div className="flex rounded-lg bg-white/[0.04] p-1 ring-1 ring-white/10" role="tablist" aria-label="Environment">
          <Link href="/dashboard?environment=live" role="tab" aria-selected={environment === "live"} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${environment === "live" ? "bg-[#f93f28] text-[#331200]" : "text-slate-400 hover:text-slate-100"}`}>Live</Link>
          <Link href="/dashboard?environment=sandbox" role="tab" aria-selected={environment === "sandbox"} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${environment === "sandbox" ? "bg-[#2d385c] text-[#f6f8fc]" : "text-slate-400 hover:text-slate-100"}`}>Sandbox</Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="animate-rise [&>.card]:h-full" style={{ "--d": "0ms" } as CSSProperties}>
          <StatCard label="Today" value="" hint={`${d.todayCount} paid order${d.todayCount === 1 ? "" : "s"} today (IST)`}>
            <AnimatedMoney value={d.todayAmount} />
          </StatCard>
        </div>
        <div className="animate-rise [&>.card]:h-full" style={{ "--d": "60ms" } as CSSProperties}>
          <StatCard label="Total received" value="" hint={`${d.paidCount} paid orders`}>
            <AnimatedMoney value={d.totalAmount} />
          </StatCard>
        </div>
        <div className="animate-rise [&>.card]:h-full" style={{ "--d": "120ms" } as CSSProperties}>
          <StatCard label="Pending / Review" value="" hint="Awaiting payment or UTR approval">
            <span><AnimatedCount value={d.pendingCount} /> / <AnimatedCount value={d.reviewCount} /></span>
          </StatCard>
        </div>
        <div className="animate-rise [&>.card]:h-full" style={{ "--d": "180ms" } as CSSProperties}>
          <StatCard label="Success rate" value={successRate} hint="Paid ÷ closed orders" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card animate-rise p-5 lg:col-span-2" style={{ "--d": "240ms" } as CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="card-title">Paid volume, last 7 days</h2>
            <span className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#f93f28]" aria-hidden="true" />Tallest day</span>
              <span>Grouped by paid date, IST</span>
            </span>
          </div>
          {d.chart7d.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <svg viewBox="0 0 96 56" className="h-14 w-24" fill="none" stroke="#989eac" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="50" x2="92" y2="50" strokeDasharray="3 4" />
                <rect x="12" y="30" width="16" height="20" rx="2" strokeDasharray="3 3" />
                <rect x="40" y="18" width="16" height="32" rx="2" strokeDasharray="3 3" />
                <rect x="68" y="36" width="16" height="14" rx="2" strokeDasharray="3 3" />
              </svg>
              <p className="mt-4 text-sm font-medium text-[#f6f8fc]">No paid orders in the last 7 days</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Paid orders will appear here as bars, grouped by day (IST).</p>
            </div>
          ) : (
            <WeekChart rows={d.chart7d} />
          )}
          <p className="mt-2 text-xs text-slate-500">Bars show paid amount per day; the number above a bar is its paid order count. The tallest day is highlighted in red.</p>
        </div>

        <div className="card animate-rise p-5" style={{ "--d": "300ms" } as CSSProperties}>
          <div className="flex items-center justify-between">
            <h2 className="card-title">Setup checklist</h2>
            <span className="font-mono text-xs text-slate-500">{done}/{d.checklist.length} done</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-[#f2b380] transition-[width] duration-300" style={{ width: `${(done / d.checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-3">
            {d.checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${c.done ? "bg-[#f2b380]/15 text-[#f2b380]" : "bg-white/[0.04] text-[#989eac] ring-1 ring-white/10"}`}>
                  {c.done ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                  )}
                </span>
                <Link href={c.url} className={c.done ? "text-slate-500 line-through" : "text-slate-200 transition-colors duration-150 hover:text-brand-300"}>{c.label}</Link>
              </li>
            ))}
          </ul>
          {done === d.checklist.length && d.checklist.length > 0 && (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-[#f2b380]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /><path d="m9 11.5 2 2 4-4" />
              </svg>
              <p className="text-sm text-slate-300">Setup complete — you&rsquo;re ready to receive payments.</p>
            </div>
          )}
          <Link href="/orders/new" className="btn btn-primary mt-5 w-full">Create payment link</Link>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium text-[#f6f8fc]">Recent orders</h2>
          <Link href="/orders" className="text-sm font-medium text-brand-400 hover:text-brand-300">View all</Link>
        </div>
        <OrdersTable
          orders={d.recentOrders.map((o) => ({
            order_no: String(o.order_no), client_order_id: String(o.client_order_id),
            amount: String(o.amount), status: String(o.status), environment: String(o.environment),
            customer_name: (o.customer_name as string | null) ?? null,
            created_at: String(o.created_at),
            account_label: (o as Record<string, unknown>).account_label as string | null ?? null,
            account_provider: (o as Record<string, unknown>).account_provider as string | null ?? null,
          }))}
          emptyHint="No orders in this environment yet. Create a payment link or call the API."
        />
      </div>
    </AppShell>
  );
}
