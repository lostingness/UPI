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
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--surface-2)] text-[var(--accent-text)] ring-1 ring-[var(--border)]">
            <Icon d={ICONS.receipt} className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-[var(--text)]">No orders yet</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
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
          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Order</th>
            <th className="th text-right font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Amount</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Status</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Account</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Customer</th>
            <th className="th font-mono text-[11px] font-bold uppercase tracking-[0.08em]">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {orders.map((o) => (
            <tr key={String(o.order_no)} className="transition-colors duration-150 hover:bg-[var(--surface-2)] focus-within:bg-[var(--surface-2)]">
              <td className="td">
                <Link href={`${baseHref}/${o.order_no}`} className="font-mono text-[13px] font-medium text-brand-600 dark:text-brand-400 underline-offset-4 hover:text-brand-700 dark:hover:text-brand-300 hover:underline">
                  {String(o.order_no)}
                </Link>
                {o.client_order_id && <div className="mt-0.5 font-mono text-xs text-[var(--muted)]">{String(o.client_order_id)}</div>}
              </td>
              <td className="td text-right font-mono font-medium text-[var(--text)] tabular-nums">{inr(Number(o.amount))}</td>
              <td className="td">
                <StatusPill status={String(o.status)} />
                {String(o.environment) === "sandbox" && <span className="ml-2"><StatusPill status="sandbox" label="Sandbox" /></span>}
              </td>
              <td className="td text-[var(--muted)]">{o.account_label ? String(o.account_label) : "—"}</td>
              <td className="td text-[var(--muted)]">{o.customer_name ? String(o.customer_name) : "—"}</td>
              <td className="td whitespace-nowrap font-mono text-xs text-[var(--muted)]">{fmtDateTime(String(o.created_at))}</td>
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
      <span className="font-mono text-xs text-[var(--muted)]">Page {page}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(page - 1)} className="btn btn-secondary btn-sm">← Previous</Link>}
        {hasMore && <Link href={href(page + 1)} className="btn btn-secondary btn-sm">Next →</Link>}
      </span>
    </div>
  );
}
