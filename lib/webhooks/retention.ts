// WebhookRetentionService — port (INVENTORY §10).
// Retention WEBHOOK_RETENTION_DAYS (default 30, min 1).
// offloadDeliveredPayloads: delivered outbox events with delivered_at ≤ now-30d
//   and non-null payload → upsert payload into archived_webhook_payloads (by
//   event_id) and set webhook_outbox.payload = NULL. The outbox skeleton row
//   is NEVER deleted.
// pruneEligibleLogs: candidate webhook_logs with created_at ≤ cutoff; per log,
//   isOrderEligibleForLogArchival() is FAIL-CLOSED: all outbox events for the
//   order must be delivered; paid ⇒ paid_at ≤ cutoff; expired ⇒
//   original_expires_at (?: expires_at) + late_grace (24h) + clock-skew (300s)
//   ≤ cutoff; failed ⇒ sandbox + sandbox_simulated_at ≤ cutoff, live failed ⇒
//   never; pending/review/unknown ⇒ never.
// archiveSingleLog: if an archive row with the same id exists, a 13-column
//   exact match is required before deleting the active row; mismatch → abort.
import { getSql } from "../db";
import { gatewayConfig } from "../config/gateway";

const LOG_COLS = ["id", "order_id", "event", "event_id", "url", "attempt", "success", "response_code", "response_body", "error_label", "payload", "created_at", "updated_at"] as const;

export async function offloadDeliveredPayloads(chunk = 100): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, event_id, payload FROM webhook_outbox
    WHERE status = 'delivered' AND payload IS NOT NULL AND delivered_at <= NOW() - (${gatewayConfig.retentionDays} * INTERVAL '1 day')
    LIMIT ${chunk}`;
  let n = 0;
  for (const r of rows as { id: number; event_id: string; payload: unknown }[]) {
    await sql`INSERT INTO archived_webhook_payloads (event_id, order_id, payload)
      SELECT event_id, order_id, payload FROM webhook_outbox WHERE id = ${r.id}
      ON CONFLICT (event_id) DO NOTHING`;
    await sql`UPDATE webhook_outbox SET payload = NULL WHERE id = ${r.id}`;
    n++;
  }
  return n;
}

export async function isOrderEligibleForLogArchival(orderId: number, cutoff: Date): Promise<boolean> {
  const sql = getSql();
  const pending = await sql`SELECT id FROM webhook_outbox WHERE order_id = ${orderId} AND status <> 'delivered' LIMIT 1`;
  if ((pending as unknown[]).length) return false;
  const orders = await sql`SELECT status, paid_at, original_expires_at, expires_at, environment, sandbox_simulated_at FROM orders WHERE id = ${orderId}`;
  const o = (orders as Record<string, unknown>[])[0];
  if (!o) return false;
  const cutoffMs = cutoff.getTime();
  if (o.status === "paid") return !!o.paid_at && new Date(o.paid_at as string).getTime() <= cutoffMs;
  if (o.status === "expired") {
    const base = (o.original_expires_at ?? o.expires_at) as string | null;
    if (!base) return false;
    return new Date(base).getTime() + gatewayConfig.latePaymentGraceHours * 3600 * 1000 + gatewayConfig.evidenceClockSkewSeconds * 1000 <= cutoffMs;
  }
  if (o.status === "failed") {
    return o.environment === "sandbox" && !!o.sandbox_simulated_at && new Date(o.sandbox_simulated_at as string).getTime() <= cutoffMs;
  }
  return false; // pending / review / unknown → never
}

export async function pruneEligibleLogs(chunk = 100): Promise<{ archived: number; skipped: number }> {
  const sql = getSql();
  const cutoff = new Date(Date.now() - gatewayConfig.retentionDays * 24 * 3600 * 1000);
  const rows = await sql`SELECT * FROM webhook_logs WHERE created_at <= ${cutoff.toISOString()} ORDER BY created_at ASC LIMIT ${chunk}`;
  let archived = 0, skipped = 0;
  for (const log of rows as Record<string, unknown>[]) {
    if (!(await isOrderEligibleForLogArchival(Number(log.order_id), cutoff))) { skipped++; continue; }
    const existing = await sql`SELECT * FROM archived_webhook_logs WHERE id = ${Number(log.id)}`;
    const arch = (existing as Record<string, unknown>[])[0];
    if (arch) {
      // 13-column exact match required before deleting the active row.
      const match = LOG_COLS.every((c) => {
        const a = arch[c], b = log[c];
        if (a === b) return true;
        if (a == null && b == null) return true;
        if (c === "payload") return JSON.stringify(a) === JSON.stringify(b);
        if (c === "created_at" || c === "updated_at") return new Date(a as string).getTime() === new Date(b as string).getTime();
        return false;
      });
      if (!match) { skipped++; continue; }
      await sql`DELETE FROM webhook_logs WHERE id = ${Number(log.id)}`;
      archived++;
      continue;
    }
    await sql`INSERT INTO archived_webhook_logs (id, order_id, event, event_id, url, payload, response_code, response_body, success, attempt, error_label, created_at, updated_at)
      VALUES (${Number(log.id)}, ${Number(log.order_id)}, ${String(log.event)}, ${log.event_id as string | null}, ${String(log.url)}, ${JSON.stringify(log.payload)}::jsonb, ${log.response_code as number | null}, NULL, ${Boolean(log.success)}, ${Number(log.attempt)}, ${log.error_label as string | null}, ${new Date(log.created_at as string).toISOString()}, ${new Date(log.updated_at as string).toISOString()})`;
    await sql`DELETE FROM webhook_logs WHERE id = ${Number(log.id)}`;
    archived++;
  }
  return { archived, skipped };
}

export async function restorePayload(eventId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`UPDATE webhook_outbox SET payload = archived_webhook_payloads.payload
    FROM archived_webhook_payloads
    WHERE webhook_outbox.event_id = ${eventId} AND archived_webhook_payloads.event_id = ${eventId}
      AND webhook_outbox.payload IS NULL RETURNING webhook_outbox.id`;
  return (rows as unknown[]).length > 0;
}
