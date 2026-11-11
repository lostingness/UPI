// upiIntentUrl — port of Order::upiIntentUrl (RFC3986 encoding).
// upi://pay?pa={upi_id}&pn={payee_name}&am={amount 2dp}&cu=INR
// + tr={order_no} ONLY for non-manual accounts (manual/P2P omits `tr` per NPCI
// guidance — consumer UPI apps reject it) + tn={note ?: order_no}.
import type { OrderRow } from "./types";

export function upiIntentUrl(order: Pick<OrderRow, "order_no" | "amount" | "note">, account: { provider: string; upi_id: string | null; payee_name: string | null }): string {
  const params: [string, string][] = [
    ["pa", account.upi_id ?? ""],
    ["pn", account.payee_name ?? ""],
    ["am", Number(order.amount).toFixed(2)],
    ["cu", "INR"],
  ];
  if (account.provider !== "manual") params.push(["tr", order.order_no]);
  params.push(["tn", order.note ?? order.order_no]);
  const q = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `upi://pay?${q}`;
}
