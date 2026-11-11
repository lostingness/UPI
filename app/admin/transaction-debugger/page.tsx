import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { OrdersTable, Pagination } from "@/components/orders-table";
import { listDebugger } from "@/components/server-data";

export const dynamic = "force-dynamic";

const STATUSES = ["", "pending", "paid", "review", "expired", "failed"];
const PROVIDERS = ["", "manual", "paytm_business", "paytm_pg", "phonepe_pg", "sandbox"];

export default async function DebuggerPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; provider?: string; environment?: string; date_from?: string; date_to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status ?? "") : "";
  const provider = PROVIDERS.includes(sp.provider ?? "") ? (sp.provider ?? "") : "";
  const environment = sp.environment === "live" || sp.environment === "sandbox" ? sp.environment : "";
  const dateFrom = sp.date_from ?? "";
  const dateTo = sp.date_to ?? "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  return (
    <AdminShell active="/admin/transaction-debugger" title="Transaction debugger" subtitle="Search every order by order no, client order ID or UTR. Merchant PII is masked." next="/admin/transaction-debugger">
      {() => <DebuggerBody q={q} status={status} provider={provider} environment={environment} dateFrom={dateFrom} dateTo={dateTo} page={page} />}
    </AdminShell>
  );
}

// Data is fetched here, inside AdminShell's children callback — i.e. only
// AFTER the admin + password-confirm gate has passed. Fetching before
// AdminShell would run admin queries (and audit writes) for unconfirmed or
// signed-out visitors.
async function DebuggerBody({ q, status, provider, environment, dateFrom, dateTo, page }: { q: string; status: string; provider: string; environment: string; dateFrom: string; dateTo: string; page: number }) {
  const { orders } = await listDebugger({ q, status, provider, environment, dateFrom, dateTo, page });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (provider) p.set("provider", provider);
    if (environment) p.set("environment", environment);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return s ? `/admin/transaction-debugger?${s}` : "/admin/transaction-debugger";
  };
  return (
        <>
          <form method="GET" action="/admin/transaction-debugger" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="d-q" className="label">Search (order / client order / UTR)</label>
              <input id="d-q" name="q" defaultValue={q} placeholder="ORD… / TST… / UTR" className="input font-mono text-[13px]" />
            </div>
            <div>
              <label htmlFor="d-status" className="label">Status</label>
              <select id="d-status" name="status" defaultValue={status} className="input">
                <option value="">All statuses</option>
                {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="d-provider" className="label">Provider</label>
              <select id="d-provider" name="provider" defaultValue={provider} className="input">
                <option value="">All providers</option>
                {PROVIDERS.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="d-env" className="label">Environment</label>
              <select id="d-env" name="environment" defaultValue={environment} className="input">
                <option value="">Live + Sandbox</option>
                <option value="live">Live</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </div>
            <div>
              <label htmlFor="d-from" className="label">From date</label>
              <input id="d-from" name="date_from" type="date" defaultValue={dateFrom} className="input" />
            </div>
            <div>
              <label htmlFor="d-to" className="label">To date</label>
              <input id="d-to" name="date_to" type="date" defaultValue={dateTo} className="input" />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <button className="btn btn-primary">Search</button>
              {(q || status || provider || environment || dateFrom || dateTo) && <Link href="/admin/transaction-debugger" className="btn btn-ghost">Clear</Link>}
            </div>
          </form>
          <OrdersTable
            orders={orders.map((o) => ({
              order_no: String(o.order_no), client_order_id: String(o.client_order_id),
              amount: String(o.amount), status: String(o.status), environment: String(o.environment),
              customer_name: o.merchant_name ? String(o.merchant_name) : "—",
              created_at: String(o.created_at),
              account_label: o.account_label ? String(o.account_label) : null,
              account_provider: o.account_provider ? String(o.account_provider) : null,
            }))}
            baseHref="/admin/transaction-debugger"
            emptyHint="No orders match these filters."
          />
          <Pagination page={page} hasMore={orders.length === 25} href={(p) => qs({ page: String(p) })} />
          <p className="mt-4 text-xs text-[var(--muted)]">Each row also shows its webhook-log count on the detail page. Opening a detail view writes a transaction_debugger_viewed audit entry.</p>
        </>
  );
}
