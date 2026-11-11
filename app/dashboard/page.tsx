import Link from "next/link";
import { AppShell } from "@/components/layout";
import { DbNotConfigured, EmptyState, StatCard, inr } from "@/components/ui";
import { OrdersTable } from "@/components/orders-table";
import { dbConfigured, getDashboard, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ environment?: string }> }) {
  const sp = await searchParams;
  const environment = sp.environment === "sandbox" ? "sandbox" : "live";
  const session = await getSessionSafe();
  const user = requireUser(session, "/dashboard");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/dashboard" title="Dashboard" subtitle={`Welcome back, ${user.name}.`}>
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
      subtitle={`Welcome back, ${user.name}. ${environment === "sandbox" ? "You are viewing TEST (sandbox) data." : "Live payments."}`}
      actions={
        <div className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
          <Link href="/dashboard?environment=live" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${environment === "live" ? "bg-brand-600 text-white shadow-sm" : "text-slate-400"}`}>Live</Link>
          <Link href="/dashboard?environment=sandbox" className={`rounded-md px-3 py-1.5 text-sm font-semibold ${environment === "sandbox" ? "bg-amber-400 text-amber-950 shadow-sm" : "text-slate-400"}`}>Sandbox · TEST</Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Today" value={inr(d.todayAmount)} hint={`${d.todayCount} paid order${d.todayCount === 1 ? "" : "s"} today (IST)`} />
        <StatCard label="Total received" value={inr(d.totalAmount)} hint={`${d.paidCount} paid orders`} />
        <StatCard label="Pending / Review" value={`${d.pendingCount} / ${d.reviewCount}`} hint="Awaiting payment or UTR approval" />
        <StatCard label="Success rate" value={successRate} hint="Paid ÷ closed orders" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Last 7 days — paid (IST)</h2>
            <span className="text-xs text-slate-500">Grouped by paid date</span>
          </div>
          {d.chart7d.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No paid orders in the last 7 days.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {d.chart7d.map((row) => {
                const max = Math.max(...d.chart7d.map((r) => r.amount), 1);
                return (
                  <div key={row.date} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-xs text-slate-500">{row.date}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-brand-500" style={{ width: `${Math.max(2, (row.amount / max) * 100)}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-semibold text-slate-200 tabular-nums">{inr(row.amount)}</span>
                    <span className="w-14 shrink-0 text-right text-xs text-slate-500">{row.count} paid</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Setup checklist</h2>
            <span className="text-xs font-medium text-slate-500">{done}/{d.checklist.length} done</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / d.checklist.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-3">
            {d.checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.done ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                  {c.done ? "✓" : "·"}
                </span>
                <Link href={c.url} className={c.done ? "text-slate-500 line-through" : "text-slate-200 hover:text-brand-300"}>{c.label}</Link>
              </li>
            ))}
          </ul>
          <Link href="/orders/new" className="btn btn-primary mt-5 w-full">Create payment link →</Link>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Recent orders</h2>
          <Link href="/orders" className="text-sm font-semibold text-brand-400 hover:text-brand-300">View all →</Link>
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
