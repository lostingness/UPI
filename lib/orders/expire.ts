// expire — port of OrderService::expire. Only from pending; conditional UPDATE
// + order.expired outbox event (idempotent via transition_key).
import { getSql } from "../db";
import { recordOutboxEvent } from "../webhooks/outbox";
import type { OrderRow } from "./types";

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
  await recordOutboxEvent(sql, { ...order, status: "expired" }, "order.expired");
  return "expired";
}
