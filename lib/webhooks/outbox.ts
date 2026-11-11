// WebhookOutboxService::record — port (INVENTORY §10).
// Must be called as part of the same logical transition as the order status
// change (see lib/db.ts: conditional UPDATE + this insert, deduped by the
// unique transition_key). Asserts the order status matches the event
// (order.paid→paid, expired→expired, under_review→review, failed→failed,
// pending/timeout→pending). order.paid is deduped by transition_key
// 'paid:{orderId}' (returns the existing row); other events use
// 'transition:{orderId}:{sequence}'. sequence = order.webhook_event_sequence+1
// (counter kept on the order row — avoids MAX()/gap-lock deadlocks).
// Payload envelope: {event_id (UUID), event_sequence, occurred_at (ISO-8601),
// event, data: toApiArray()}. Identity/snapshot fields are immutable after insert.
import type { Sql } from "../db";
import type { OrderRow } from "../orders/types";
import { toApiArray } from "../orders/serialize";
import { gatewayConfig } from "../config/gateway";
import crypto from "node:crypto";

const EVENT_STATUS: Record<string, string> = {
  "order.paid": "paid", "order.expired": "expired", "order.under_review": "review",
  "order.failed": "failed", "order.pending": "pending", "order.timeout": "pending",
};

export interface OutboxRow { id: number; event_id: string; order_id: number; sequence: number; transition_key: string; event: string; environment: string; status: string; }

export async function recordOutboxEvent(sql: Sql, order: OrderRow, event: string, account: { provider: string; upi_id: string | null; payee_name: string | null } | null = null): Promise<OutboxRow | null> {
  const expected = EVENT_STATUS[event];
  if (expected && order.status !== expected) {
    throw new Error(`Outbox event ${event} does not match order status ${order.status}`);
  }
  const transitionKey = event === "order.paid" ? `paid:${order.id}` : `transition:${order.id}:${order.webhook_event_sequence + 1}`;
  // Bump the per-order sequence counter (single statement, guarded).
  const bumped = await sql`
    UPDATE orders SET webhook_event_sequence = webhook_event_sequence + 1, updated_at = NOW()
    WHERE id = ${order.id} RETURNING webhook_event_sequence`;
  const sequence = Number((bumped as { webhook_event_sequence: number }[])[0]?.webhook_event_sequence ?? order.webhook_event_sequence + 1);
  const eventId = crypto.randomUUID();
  const payload = {
    event_id: eventId, event_sequence: sequence,
    occurred_at: new Date().toISOString(), event,
    data: toApiArray(order, account, gatewayConfig.appUrl),
  };
  const rows = await sql`
    INSERT INTO webhook_outbox (event_id, order_id, sequence, transition_key, event, environment, payload, status, available_at)
    VALUES (${eventId}, ${order.id}, ${sequence}, ${transitionKey}, ${event}, ${order.environment}, ${JSON.stringify(payload)}::jsonb, 'pending', NOW())
    ON CONFLICT (transition_key) DO NOTHING RETURNING id, event_id, order_id, sequence, transition_key, event, environment, status`;
  const inserted = (rows as OutboxRow[])[0];
  if (inserted) return inserted;
  // Dedupe hit (order.paid recorded twice) — return the existing row.
  const existing = await sql`SELECT id, event_id, order_id, sequence, transition_key, event, environment, status FROM webhook_outbox WHERE transition_key = ${transitionKey}`;
  return (existing as OutboxRow[])[0] ?? null;
}
