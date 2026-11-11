// Cron handlers (INVENTORY §1.3 / §12). Called by the /api/cron/* routes.
// orders:check-pending runs every minute; webhook dispatch every minute;
// offload + prune daily. 1-minute crons need a paid Vercel plan (Hobby allows
// daily crons only) — flag to the user (see README).
import { checkPendingBatch } from "./orders/check";
import { dispatchDue } from "./webhooks/dispatcher";
import { offloadDeliveredPayloads, pruneEligibleLogs } from "./webhooks/retention";

export async function runOrdersCheckPending() { return checkPendingBatch(); }
export async function runWebhooksDispatch() { return dispatchDue(); }
export async function runWebhooksOffload() { return { offloaded: await offloadDeliveredPayloads(100) }; }
export async function runWebhooksPrune() { return pruneEligibleLogs(100); }
