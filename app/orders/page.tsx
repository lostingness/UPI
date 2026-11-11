import Link from "next/link";
import { AppShell } from "@/components/layout";
import { DbNotConfigured, StatusPill } from "@/components/ui";
import { OrdersTable, Pagination } from "@/components/orders-table";
import { dbConfigured, getSessionSafe, listMerchantOrders, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

const STATUSES = ["", "pending", "paid", "review", "expired", "failed"];

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ environment?: string; status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const environment = sp.environment === "sandbox" ? "sandbox" : sp.environment === "live" ? "live" : "";
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status ?? "") : "";
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const session = await getSessionSafe();
  const user = requireUser(session, "/orders");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/orders" title="Orders" subtitle="Every payment link you have created.">
        <DbNotConfigured context="The order list needs the database." />
      </AppShell>
    );
  }
  const { orders, counts, perPage } = await listMerchantOrders(user.id, { environment, status, q, page });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (environment) p.set("environment", environment);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `/orders?${s}` : "/orders";
  };

  return (
    <AppShell
      user={user} active="/orders" title="Orders" subtitle="Every payment link you have created."
      actions={<Link href="/orders/new" className="btn btn-primary">+ New payment link</Link>}
    >
      <form method="GET" action="/orders" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-44 flex-1">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Order no, client order ID or UTR" className="input" />
        </div>
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="">All statuses</option>
            {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="environment" className="label">Environment</label>
          <select id="environment" name="environment" defaultValue={environment} className="input">
            <option value="">Live + Sandbox</option>
            <option value="live">Live</option>
            <option value="sandbox">Sandbox</option>
          </select>
        </div>
        <button className="btn btn-primary">Filter</button>
        {(q || status || environment) && <Link href="/orders" className="btn btn-ghost">Clear</Link>}
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s || "all"} href={qs({ status: s, page: "" })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${status === s ? "bg-brand-600/20 text-brand-300 ring-brand-500/40" : "bg-slate-900 text-slate-400 ring-slate-800 hover:text-slate-200"}`}>
            {s === "" ? "All" : s} {s !== "" && <span className="text-slate-500">({counts[s] ?? 0})</span>}
          </Link>
        ))}
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          <StatusPill status="live" label="Live" /> <StatusPill status="sandbox" label="TEST" />
        </span>
      </div>

      <OrdersTable orders={orders} />
      <Pagination page={page} hasMore={orders.length === perPage} href={(p) => qs({ page: String(p) })} />
    </AppShell>
  );
}
