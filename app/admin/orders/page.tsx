import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { OrdersTable, Pagination } from "@/components/orders-table";
import { listAdminOrders } from "@/components/server-data";

export const dynamic = "force-dynamic";

const STATUSES = ["", "pending", "paid", "review", "expired", "failed"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status ?? "") : "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { orders } = await listAdminOrders(status, page);
  return (
    <AdminShell active="/admin/orders" title="All orders" subtitle="Every order from every merchant. Select an order for the read-only detail view and manual override." next="/admin/orders">
      {() => (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Link key={s || "all"} href={s ? `/admin/orders?status=${s}` : "/admin/orders"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${status === s ? "bg-brand-600/20 text-brand-300 ring-brand-500/40" : "bg-slate-900 text-slate-400 ring-slate-800 hover:text-slate-200"}`}>
                {s === "" ? "All" : s}
              </Link>
            ))}
          </div>
          <OrdersTable
            orders={orders.map((o) => ({
              order_no: String(o.order_no), client_order_id: String(o.client_order_id),
              amount: String(o.amount), status: String(o.status), environment: String(o.environment),
              customer_name: String((o as Record<string, unknown>).merchant_name ?? o.customer_name ?? "—"),
              created_at: String(o.created_at),
              account_label: (o as Record<string, unknown>).account_label as string | null ?? null,
              account_provider: null,
            }))}
            baseHref="/admin/orders"
            emptyHint="No orders match this filter."
          />
          <Pagination page={page} hasMore={orders.length === 30} href={(p) => `/admin/orders?${new URLSearchParams({ ...(status ? { status } : {}), page: String(p) }).toString()}`} />
        </>
      )}
    </AdminShell>
  );
}
