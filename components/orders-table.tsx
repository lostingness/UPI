// Shared order table — port of orders/_table.blade.php + orders/index.blade.php.
import Link from "next/link";
import { fmtDateTime, inr, StatusPill } from "./ui";
import type { OrderListItem } from "./server-data";

export function OrdersTable({ orders, baseHref = "/orders", emptyHint }: {
  orders: OrderListItem[];
  baseHref?: string;
  emptyHint?: string;
}) {
  if (!orders.length) {
    return (
      <div className="card">
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-200">No orders yet</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {emptyHint ?? "Orders created from your dashboard or via the API will show up here."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="th">Order</th>
            <th className="th">Amount</th>
            <th className="th">Status</th>
            <th className="th">Account</th>
            <th className="th">Customer</th>
            <th className="th">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {orders.map((o) => (
            <tr key={String(o.order_no)} className="hover:bg-slate-800/40">
              <td className="td">
                <Link href={`${baseHref}/${o.order_no}`} className="font-mono text-[13px] font-semibold text-brand-400 hover:text-brand-300">
                  {String(o.order_no)}
                </Link>
                {o.client_order_id && <div className="mt-0.5 font-mono text-xs text-slate-500">{String(o.client_order_id)}</div>}
              </td>
              <td className="td font-semibold text-slate-100 tabular-nums">{inr(Number(o.amount))}</td>
              <td className="td">
                <StatusPill status={String(o.status)} />
                {String(o.environment) === "sandbox" && <span className="ml-2"><StatusPill status="sandbox" label="TEST" /></span>}
              </td>
              <td className="td text-slate-400">{o.account_label ? String(o.account_label) : "—"}</td>
              <td className="td text-slate-400">{o.customer_name ? String(o.customer_name) : "—"}</td>
              <td className="td whitespace-nowrap text-slate-500">{fmtDateTime(String(o.created_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, hasMore, href }: { page: number; hasMore: boolean; href: (p: number) => string }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">Page {page}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className="btn btn-secondary btn-sm">← Previous</Link>}
        {hasMore && <Link href={href(page + 1)} className="btn btn-secondary btn-sm">Next →</Link>}
      </span>
    </div>
  );
}
