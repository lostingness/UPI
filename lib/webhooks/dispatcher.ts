// WebhookOutboxDispatcher — port (INVENTORY §10).
// due(): status ∈ pending/queued/failed, delivered_at null, available_at ≤ now,
// unclaimed or claim expired (claim_seconds = 120).
// dispatchDue(): up to outbox_batch_size (default 100) ordered by
// available_at, id; per event claim it (claim_token UUID, claimed_at=now,
// available_at = now+claim_seconds, dispatch_attempts+1), then deliver
// directly (no queue worker on Vercel — see lib/webhooks/send.ts) and clear
// the claim on success, or leave available_at = now+reconcile_seconds (3 h)
// after a successful queue-equivalent hand-off. On delivery failure the
// send step sets the retry available_at itself.
import { getSql } from "../db";
import { gatewayConfig } from "../config/gateway";
import { sendOutboxEvent } from "./send";
import crypto from "node:crypto";

export async function dispatchDue(): Promise<{ claimed: number; delivered: number; failed: number }> {
  const sql = getSql();
  const due = await sql`
    SELECT id, event_id FROM webhook_outbox
    WHERE status IN ('pending', 'queued', 'failed') AND delivered_at IS NULL
      AND (available_at IS NULL OR available_at <= NOW())
      AND (claim_token IS NULL OR claimed_at IS NULL OR claimed_at <= NOW() - (${gatewayConfig.claimSeconds} * INTERVAL '1 second'))
    ORDER BY available_at NULLS FIRST, id ASC
    LIMIT ${gatewayConfig.outboxBatchSize}`;
  let claimed = 0, delivered = 0, failed = 0;
  for (const row of due as { id: number; event_id: string }[]) {
    const token = crypto.randomUUID();
    const claimedRows = await sql`
      UPDATE webhook_outbox SET claim_token = ${token}, claimed_at = NOW(),
        available_at = NOW() + (${gatewayConfig.claimSeconds} * INTERVAL '1 second'),
        dispatch_attempts = dispatch_attempts + 1, status = 'queued', queued_at = NOW(), updated_at = NOW()
      WHERE id = ${row.id} AND (claim_token IS NULL OR claimed_at IS NULL OR claimed_at <= NOW() - (${gatewayConfig.claimSeconds} * INTERVAL '1 second'))
      RETURNING id`;
    if ((claimedRows as unknown[]).length === 0) continue;
    claimed++;
    try {
      const res = await sendOutboxEvent(row.event_id);
      if (res.delivered) delivered++; else failed++;
    } catch { failed++; }
  }
  return { claimed, delivered, failed };
}
