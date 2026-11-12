// Cron handlers (INVENTORY §1.3 / §12). Called by the /api/cron/* routes.
// orders:check-pending runs every minute; webhook dispatch every minute;
// offload + prune daily. 1-minute crons need a paid Vercel plan (Hobby allows
// daily crons only) — flag to the user (see README).
import { checkPendingBatch } from "./orders/check";
import { releaseExpiredAllocations } from "./orders/allocations";
import { getSql } from "./db";
import { dispatchDue } from "./webhooks/dispatcher";
import { reconcileMissingPaidEvents } from "./webhooks/outbox";
import { offloadDeliveredPayloads, pruneEligibleLogs } from "./webhooks/retention";
import { pruneIdempotencyKeys } from "./idempotency";
import { timingSafeEqual } from "./crypto";

/**
 * Round 7 (L8): shared cron authorisation. The four /api/cron/* routes used
 * `===` to compare the Authorization header with `Bearer ${CRON_SECRET}` —
 * a non-constant-time comparison on a secret. timingSafeEqual is constant
 * time (and false on length mismatch). Unset secret still fails closed in
 * production; local dev is the only allowance (same rule as before).
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return timingSafeEqual(auth, `Bearer ${secret}`);
}

export async function runOrdersCheckPending() {
  const result = await checkPendingBatch();
  // Reclaim unique QR amounts whose orders expired, failed, or were paid
  // (and any allocation past its own expiry). Best-effort: a sweep failure
  // must never break the pending-order check; the next run retries.
  let releasedAllocations = 0;
  try { releasedAllocations = await releaseExpiredAllocations(getSql()); } catch { /* best-effort */ }
  return { ...result, released_allocations: releasedAllocations };
}
export async function runWebhooksDispatch() {
  // Round 10 (M3): recover any order.paid event lost after its paid commit
  // BEFORE dispatch, so a recovered event (available_at = NOW()) can be
  // dispatched in this same run. Best-effort — a reconciler failure must
  // never break dispatch; the next run retries.
  let reconciledPaidEvents = 0;
  try { reconciledPaidEvents = await reconcileMissingPaidEvents(getSql()); } catch { /* best-effort */ }
  const dispatchResult = await dispatchDue();
  return { ...dispatchResult, reconciled_paid_events: reconciledPaidEvents };
}
export async function runWebhooksOffload() { return { offloaded: await offloadDeliveredPayloads(100) }; }
export async function runWebhooksPrune() {
  const logs = await pruneEligibleLogs(100);
  // Expired idempotency keys (24 h) are pruned in the same run; a prune
  // failure here must not break webhook-log pruning (best-effort).
  let idempotencyPruned = 0;
  try { idempotencyPruned = await pruneIdempotencyKeys(); } catch { /* best-effort */ }
  return { ...logs, idempotency_pruned: idempotencyPruned };
}
