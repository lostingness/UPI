// Shared order table — receipt-style rows, mono order numbers, one ₹ format.
// Meridian: hairline receipt rows, peach receipt-mark empty state, tabular figures.
import Link from "next/link";
import { fmtDateTime, inr, Icon, ICONS, StatusPill } from "./ui";
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
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.03] text-[#f2b380] ring-1 ring-white/10">
            <Icon d={ICONS.receipt} className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-[#f6f8fc]">No orders yet</p>
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
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Order</th>
            <th className="th text-right font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Amount</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Status</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Account</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Customer</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {orders.map((o) => (
            <tr key={String(o.order_no)} className="transition-colors duration-150 hover:bg-white/[0.03] focus-within:bg-white/[0.03]">
              <td className="td">
                <Link href={`${baseHref}/${o.order_no}`} className="font-mono text-[13px] font-medium text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">
                  {String(o.order_no)}
                </Link>
                {o.client_order_id && <div className="mt-0.5 font-mono text-xs text-slate-500">{String(o.client_order_id)}</div>}
              </td>
              <td className="td text-right font-mono font-medium text-[#f6f8fc] tabular-nums">{inr(Number(o.amount))}</td>
              <td className="td">
                <StatusPill status={String(o.status)} />
                {String(o.environment) === "sandbox" && <span className="ml-2"><StatusPill status="sandbox" label="Sandbox" /></span>}
              </td>
              <td className="td text-slate-400">{o.account_label ? String(o.account_label) : "—"}</td>
              <td className="td text-slate-400">{o.customer_name ? String(o.customer_name) : "—"}</td>
              <td className="td whitespace-nowrap font-mono text-xs text-slate-500">{fmtDateTime(String(o.created_at))}</td>
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
      <span className="font-mono text-xs text-slate-500">Page {page}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className="btn btn-secondary btn-sm">← Previous</Link>}
        {hasMore && <Link href={href(page + 1)} className="btn btn-secondary btn-sm">Next →</Link>}
      </span>
    </div>
  );
}
