// Admin manual-payment override — port of OrderService::adminOverridePaid.
// Live orders only; not already paid; amount must equal the order amount;
// reference 6–80 [A-Za-z0-9_-]; reason 20–500 chars. Sets status paid,
// utr = provider_txn_id = reference (uppercased), verified_by=admin_override,
// paid_at now; writes an AdminAuditLog row; emits order.paid.
import { getSql } from "../db";
import { ApiError } from "../errors";
import { recordOutboxEvent } from "../webhooks/outbox";
import { auditLog } from "../audit";
import type { OrderRow } from "./types";

export async function adminOverridePaid(order: OrderRow, adminId: number, ip: string | null, amount: number, reference: string, reason: string): Promise<OrderRow> {
  if (order.environment !== "live") throw new ApiError(422, "Only live orders can be overridden.");
  if (order.status === "paid") throw new ApiError(422, "Order is already paid.");
  if (Number(amount).toFixed(2) !== Number(order.amount).toFixed(2)) throw new ApiError(422, "Amount must equal the order amount.");
  const ref = reference.toUpperCase();
  const sql = getSql();
  const clash = await sql`SELECT id FROM orders WHERE user_id = ${order.user_id} AND utr = ${ref} AND id <> ${order.id} LIMIT 1`;
  if ((clash as unknown[]).length > 0) throw new ApiError(422, "This UTR is already used for another order.");
  const updated = await sql`
    UPDATE orders SET status = 'paid', utr = ${ref}, provider_txn_id = ${ref}, verified_by = 'admin_override',
      paid_at = NOW(), updated_at = NOW()
    WHERE id = ${order.id} AND status <> 'paid' RETURNING *`;
  const row = (updated as OrderRow[])[0];
  if (!row) throw new ApiError(409, "Order status changed while applying the override");
  await auditLog(sql, adminId, "order_manual_payment_override", "order", order.id, {
    order_no: order.order_no, merchant_id: order.user_id, amount: Number(order.amount).toFixed(2),
    verification_reference: ref, reason,
  }, ip);
  await recordOutboxEvent(sql, row, "order.paid");
  return row;
}
