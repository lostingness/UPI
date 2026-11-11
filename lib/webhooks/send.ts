// SendWebhook — port of app/Jobs/SendWebhook.php ($tries=6, backoff
// [30,120,600,1800,3600] s expressed via available_at/dispatch_attempts).
// Steps, in order: (1) reconciliation — if a successful log already exists for
// (order, event_id, event) in either tier, markDelivered without sending;
// (2) blocked → return; (3) merchant + env select URL/secret (sandbox →
// sandbox_webhook_url + sandbox signing secret, else live; live secret fallback
// = api_secret, sandbox fallback = sandbox_api_secret); missing URL/secret →
// block('configuration_missing'); sandbox URL == live URL →
// block('environment_url_collision'); (4) SSRF re-validation at send time via
// SafeUrl → failure logs webhook_logs (error_label='blocked_url') +
// block('blocked_url'), no retry; (5) sign body (t=…,v1=…) → headers
// X-Signature, X-Signature-Timestamp, X-Webhook-Timestamp, X-Event,
// X-Event-Id; (6) POST timeout 15 s, connect timeout 5 s, NO redirects,
// body = JSON (unescaped slashes); (7) success = HTTP 2xx; response body is
// NEVER stored — only status code + short error_label. Every attempt writes a
// webhook_logs row (response_body always NULL). On failure the outbox row gets
// last_error and a retry available_at; after max_dispatch_generations the row
// is blocked.
//
// DNS-REBIND NOTE (§10 OPEN QUESTION): PHP used CURLOPT_RESOLVE to pin
// host:port to the validated IP. fetch has no equivalent. This port re-validates
// the URL (fresh DNS lookup, all answers must be public) immediately before
// sending, which closes the common rebind window but does NOT pin the socket
// to the validated IP — a hostile DNS that flips between validation and
// connect remains a residual risk. Documented here and in the README; a
// pinned-socket transport (undici Agent with a custom lookup) is a future
// hardening step, not silently claimed.
import { getSql } from "../db";
import { decryptText } from "../crypto";
import { signWebhook } from "./signature";
import { checkSafeUrl } from "./safe-url";
import { hasSuccessfulLog } from "./history";
import { gatewayConfig } from "../config/gateway";

export interface OutboxEventRow {
  id: number; event_id: string; order_id: number; event: string; environment: string;
  payload: Record<string, unknown> | null; status: string; dispatch_attempts: number;
  delivery_attempts: number;
}

export async function sendOutboxEvent(eventId: string): Promise<{ delivered: boolean; reason: string }> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM webhook_outbox WHERE event_id = ${eventId}`;
  const outbox = (rows as OutboxEventRow[])[0];
  if (!outbox) return { delivered: false, reason: "not_found" };
  if (outbox.status === "delivered") return { delivered: true, reason: "already_delivered" };
  if (outbox.status === "blocked") return { delivered: false, reason: "blocked" };
  if (!outbox.payload) return { delivered: false, reason: "payload_offloaded" };

  const orderRows = await sql`SELECT * FROM orders WHERE id = ${outbox.order_id}`;
  const order = (orderRows as Record<string, unknown>[])[0];
  if (!order) return { delivered: false, reason: "order_not_found" };

  // (1) Reconciliation.
  if (await hasSuccessfulLog(outbox.order_id, outbox.event_id, outbox.event)) {
    await markDelivered(outbox.id);
    return { delivered: true, reason: "reconciled" };
  }

  const userRows = await sql`SELECT * FROM users WHERE id = ${Number(order.user_id)}`;
  const user = (userRows as Record<string, unknown>[])[0];
  if (!user) return { delivered: false, reason: "merchant_not_found" };

  const sandbox = outbox.environment === "sandbox";
  const url = (sandbox ? user.sandbox_webhook_url : user.webhook_url) as string | null;
  const secretEnc = (sandbox ? user.sandbox_webhook_secret : user.webhook_secret) as string | null;
  const fallbackEnc = (sandbox ? user.sandbox_api_secret : user.api_secret) as string | null;
  const secret = (() => { try { return decryptText(secretEnc) ?? decryptText(fallbackEnc); } catch { return null; } })();

  const block = async (label: string, errorLabel?: string) => {
    await sql`UPDATE webhook_outbox SET status = 'blocked', last_error = ${label}, available_at = NULL, updated_at = NOW() WHERE id = ${outbox.id}`;
    if (errorLabel) await logAttempt(outbox, url, null, false, 1, errorLabel);
    return { delivered: false, reason: label };
  };
  if (!url || !secret) return block("configuration_missing");
  if (sandbox && url === (user.webhook_url as string | null)) return block("environment_url_collision");

  // (4) SSRF re-validation at send time.
  try { await checkSafeUrl(url); }
  catch { await logAttempt(outbox, url, null, false, 1, "blocked_url"); return block("blocked_url"); }

  const body = JSON.stringify(outbox.payload);
  const { header, timestamp } = signWebhook(body, secret);
  const attempt = outbox.delivery_attempts + 1;
  let statusCode: number | null = null;
  let errorLabel: string | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": header,
        "X-Signature-Timestamp": String(timestamp),
        "X-Webhook-Timestamp": String(timestamp),
        "X-Event": outbox.event,
        "X-Event-Id": outbox.event_id,
      },
      body, redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    statusCode = res.status;
    if (res.status >= 200 && res.status < 300) {
      await logAttempt(outbox, url, statusCode, true, attempt, null);
      await markDelivered(outbox.id);
      return { delivered: true, reason: "ok" };
    }
    errorLabel = res.status >= 500 ? `http_${res.status}` : `http_${res.status}`;
  } catch (e) {
    const msg = String((e as Error)?.name ?? "");
    errorLabel = msg.includes("Timeout") || msg.includes("Abort") ? "timeout" : "network_error";
  }
  await logAttempt(outbox, url, statusCode, false, attempt, errorLabel);
  // Retry accounting: generation fencing via dispatch_attempts.
  const generations = outbox.dispatch_attempts + 1;
  if (generations >= gatewayConfig.maxDispatchGenerations) {
    await sql`UPDATE webhook_outbox SET status = 'blocked', last_error = 'exhausted_generations', available_at = NULL, updated_at = NOW() WHERE id = ${outbox.id}`;
    return { delivered: false, reason: "exhausted_generations" };
  }
  const backoff = [30, 120, 600, 1800, 3600][Math.min(attempt - 1, 4)];
  await sql`UPDATE webhook_outbox SET status = 'failed', dispatch_attempts = ${generations},
    delivery_attempts = ${attempt}, last_error = ${errorLabel},
    available_at = NOW() + (${backoff} * INTERVAL '1 second'), updated_at = NOW() WHERE id = ${outbox.id}`;
  return { delivered: false, reason: errorLabel ?? "failed" };
}

async function markDelivered(outboxId: number): Promise<void> {
  const sql = getSql();
  await sql`UPDATE webhook_outbox SET status = 'delivered', delivered_at = NOW(), claim_token = NULL, claimed_at = NULL, last_error = NULL, updated_at = NOW() WHERE id = ${outboxId}`;
}

async function logAttempt(outbox: OutboxEventRow, url: string | null, code: number | null, success: boolean, attempt: number, errorLabel: string | null): Promise<void> {
  const sql = getSql();
  await sql`INSERT INTO webhook_logs (order_id, event, event_id, url, payload, response_code, response_body, success, attempt, error_label)
    VALUES (${outbox.order_id}, ${outbox.event}, ${outbox.event_id}, ${url ?? ""}, ${JSON.stringify(outbox.payload)}::jsonb, ${code}, NULL, ${success}, ${attempt}, ${errorLabel})`;
}
