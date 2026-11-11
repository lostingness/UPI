// WebhookHistoryService — unified query over webhook_logs UNION ALL
// archived_webhook_logs (13 shared columns + storage_tier literal).
import { getSql } from "../db";

export interface WebhookLogRow {
  id: number; order_id: number; event: string; event_id: string | null; url: string;
  payload: Record<string, unknown> | null; response_code: number | null; response_body: string | null;
  success: boolean; attempt: number; error_label: string | null; created_at: string; updated_at: string;
  storage_tier: "active" | "archive";
}

export async function getLogsForOrder(orderId: number, limit = 25, offset = 0): Promise<WebhookLogRow[]> {
  const sql = getSql();
  const rows = await sql`
    (SELECT id, order_id, event, event_id, url, payload, response_code, response_body, success, attempt, error_label, created_at, updated_at, 'active' AS storage_tier FROM webhook_logs WHERE order_id = ${orderId})
    UNION ALL
    (SELECT id, order_id, event, event_id, url, payload, response_code, response_body, success, attempt, error_label, created_at, updated_at, 'archive' AS storage_tier FROM archived_webhook_logs WHERE order_id = ${orderId})
    ORDER BY created_at DESC, id DESC, storage_tier ASC LIMIT ${limit} OFFSET ${offset}`;
  return rows as unknown as WebhookLogRow[];
}

export async function hasSuccessfulLog(orderId: number, eventId?: string, event?: string): Promise<boolean> {
  const sql = getSql();
  const active = await sql`SELECT id FROM webhook_logs WHERE order_id = ${orderId} AND success = true
    AND (${eventId ?? null}::uuid IS NULL OR event_id = ${eventId ?? null})
    AND (${event ?? null}::text IS NULL OR event = ${event ?? null}) LIMIT 1`;
  if ((active as unknown[]).length) return true;
  const archived = await sql`SELECT id FROM archived_webhook_logs WHERE order_id = ${orderId} AND success = true
    AND (${eventId ?? null}::uuid IS NULL OR event_id = ${eventId ?? null})
    AND (${event ?? null}::text IS NULL OR event = ${event ?? null}) LIMIT 1`;
  return (archived as unknown[]).length > 0;
}
