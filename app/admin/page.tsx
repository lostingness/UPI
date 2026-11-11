import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { LeaseRecoveryForm } from "@/components/admin-forms";
import { OrdersTable } from "@/components/orders-table";
import { StatCard, fmtDateTime } from "@/components/ui";
import { adminOverview } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return (
    <AdminShell active="/admin" title="Admin" subtitle="All merchants, orders, accounts, webhooks and audit logs." next="/admin">
      {() => <AdminBody />}
    </AdminShell>
  );
}

// Data is fetched here, inside AdminShell's children callback — i.e. only
// AFTER the admin + password-confirm gate has passed. Fetching before
// AdminShell would run admin queries (and audit writes) for unconfirmed or
// signed-out visitors.
async function AdminBody() {
  const o = await adminOverview();
  return (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Merchants" value={String(o.merchants)} hint="Registered merchant accounts" />
            <StatCard label="Orders" value={String(o.orders)} hint={`${o.paidOrders} paid · ${o.pendingOrders} pending`} />
            <StatCard label="Payment accounts" value={String(o.accounts)} hint="Across all merchants" />
            <StatCard label="Webhook outbox open" value={String(o.outboxOpen)} hint="Pending / failed deliveries" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-medium text-[var(--text)]">UTR review queue</h2>
                <Link href="/admin/orders?status=review" className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">All review orders →</Link>
              </div>
              <OrdersTable
                orders={o.reviewQueue.map((r) => ({
                  order_no: String(r.order_no), client_order_id: String(r.client_order_id),
                  amount: String(r.amount), status: String(r.status), environment: String(r.environment),
                  customer_name: (r as Record<string, unknown>).merchant_name as string | null ?? null,
                  created_at: String(r.created_at), account_label: null, account_provider: null,
                }))}
                baseHref="/admin/orders"
                emptyHint="No orders are waiting for UTR review right now."
              />
            </div>
            <div className="card p-5">
              <h2 className="card-title">Recent audit activity</h2>
              {o.recentAudit.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">No audit events yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5 text-sm">
                  {o.recentAudit.map((a) => (
                    <li key={String(a.id)} className="flex justify-between gap-3">
                      <span className="font-mono text-[13px] text-[var(--text)]">{String(a.action)}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">{fmtDateTime(String(a.created_at))}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin/audit-logs" className="btn btn-secondary mt-4 w-full">View all audit logs →</Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="card-title">Verification-lease recovery</h2>
              <div className="mt-4"><LeaseRecoveryForm /></div>
            </div>
            <div className="card p-5">
              <h2 className="card-title">Admin sections</h2>
              <nav className="mt-4 grid gap-2 text-sm">
                {[
                  ["/admin/merchants", "Merchants", "Enable / disable merchant accounts (audit-logged)."],
                  ["/admin/orders", "All orders", "Every order, any merchant, with status filter."],
                  ["/admin/accounts", "All accounts", "Every payment account, any merchant."],
                  ["/admin/webhooks", "Webhook outbox", "Pending / failed / delivered deliveries; retry or restore payloads."],
                  ["/admin/transaction-debugger", "Transaction debugger", "Search by order, UTR or merchant; masked PII."],
                  ["/admin/audit-logs", "Audit logs", "Every admin action, newest first."],
                ].map(([href, label, hint]) => (
                  <Link key={href} href={href} className="rounded-lg bg-[var(--surface-2)] px-4 py-3 ring-1 ring-[var(--border)] hover:bg-[var(--surface-2)]">
                    <span className="font-medium text-[var(--text)]">{label}</span>
                    <span className="block text-xs text-[var(--muted)]">{hint}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </>
  );
}
