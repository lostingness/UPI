// expire — port of OrderService::expire. Only from pending; conditional UPDATE
// + order.expired outbox event (idempotent via transition_key).
// Expiry also releases the order's unique-amount allocation (the amount can
// be allocated again) and sweeps any other stale allocations.
import { getSql } from "../db";
import { recordOutboxEvent } from "../webhooks/outbox";
import type { OrderRow } from "./types";
import { releaseAllocation, releaseExpiredAllocations } from "./allocations";

export async function expireOrderInDb(order: OrderRow): Promise<"expired" | "unchanged"> {
  if (order.status !== "pending") return "unchanged";
  const sql = getSql();
  const updated = await sql`
    UPDATE orders SET status = 'expired',
      verification_token = NULL, verification_generation = 0, verification_expires_at = NULL,
      verification_started_at = NULL, verification_node_id = NULL,
      verification_node_instance_id = NULL, verification_process_identity = NULL,
      updated_at = NOW()
    WHERE id = ${order.id} AND status = 'pending' RETURNING id`;
  if ((updated as unknown[]).length === 0) return "unchanged";
  // Free this order's unique amount, and sweep any other allocations whose
  // orders have since expired, failed, or been paid. Best-effort: a release
  // failure must never block the expiry itself; the cron sweep retries.
  try { await releaseAllocation(sql, order.id, "expired"); } catch { /* best-effort */ }
  try { await releaseExpiredAllocations(sql); } catch { /* best-effort */ }
  await recordOutboxEvent(sql, { ...order, status: "expired" }, "order.expired");
  return "expired";
}
