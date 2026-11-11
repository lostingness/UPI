// Merchant notifications — server-side store for the in-app notification
// centre (Round 5). Notifications OBSERVE order status changes; they never
// cause them. Every creation is best-effort: use createNotificationSafe()
// from a transition path so a notification failure can never roll back or
// block a confirmed payment. Rows are deduped by `dedupe_key`
// (migration 015) so a retried transition, an idempotency replay, or a
// double hook can never produce a duplicate row for the same event.
//
// No SMS/email is sent from here — there is no payer consent or channel
// for it. Webhooks (lib/webhooks/outbox.ts) are untouched; notifications
// are in addition to webhooks, not a replacement.
//
// Lazy table creation follows the migration-013 pattern: the migration file
// is canonical for fresh installs, but a deployed instance self-heals if
// `npm run migrate` has not been run yet.
import { getSql, type Sql } from "./db";
import { payableAmountFor, type OrderRow } from "./orders/types";

export type NotificationType =
  | "payment_received"
  | "order_created"
  | "utr_submitted"
  | "order_expired";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "payment_received",
  "order_created",
  "utr_submitted",
  "order_expired",
];

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as string[]).includes(v);
}

export interface NotificationRow {
  id: number;
  user_id: number;
  order_id: number | null;
  order_no: string | null;
  type: NotificationType;
  title: string;
  body: string;
  amount: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationInput {
  userId: number;
  orderId?: number | null;
  orderNo?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  /** 2dp amount string (payable amount for payments). */
  amount?: string | null;
  /** Idempotency key for this event, e.g. `payment_received:123`. When set,
   * a repeat insert for the same event is a no-op (returns the existing row). */
  dedupeKey?: string | null;
}

/** INR formatting for notification copy — en-IN, always 2dp. */
export function formatInr(amount: number | string): string {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Pure copy builder: the exact title/body/dedupe-key for one order event.
 * Testable without a database. `via` distinguishes the two paid paths
 * (provider verification vs merchant UTR-review approval).
 */
export function buildNotification(
  type: NotificationType,
  order: Pick<OrderRow, "id" | "order_no" | "user_id" | "amount" | "payable_amount" | "utr_attempts">,
  opts: { via?: "provider" | "utr_review" } = {},
): { title: string; body: string; amount: string | null; dedupeKey: string } {
  const amount = payableAmountFor(order);
  const no = order.order_no;
  switch (type) {
    case "payment_received":
      return {
        title: `Payment received ${formatInr(amount)}`,
        body:
          opts.via === "utr_review"
            ? `Order ${no} was marked paid after you approved the UTR.`
            : `Order ${no} was paid and verified by the provider.`,
        amount,
        dedupeKey: `payment_received:${order.id}`,
      };
    case "order_created":
      return {
        title: `New payment link ${formatInr(amount)}`,
        body: `Order ${no} was created. Share the payment link to collect ${formatInr(amount)}.`,
        amount,
        dedupeKey: `order_created:${order.id}`,
      };
    case "utr_submitted":
      return {
        title: `UTR submitted for ${no}`,
        body: `The customer submitted a UTR for order ${no} (${formatInr(amount)}). Check your bank app and approve or reject it.`,
        amount,
        dedupeKey: `utr_submitted:${order.id}:${order.utr_attempts}`,
      };
    case "order_expired":
      return {
        title: `Order ${no} expired`,
        body: `Order ${no} (${formatInr(amount)}) expired unpaid. The customer needs a new payment link.`,
        amount,
        dedupeKey: `order_expired:${order.id}`,
      };
  }
}

// --- Lazy table creation (migration-013 pattern) ---------------------------
let notificationsTableEnsured = false;
/** Test seam: reset the once-per-process lazy-creation flag. */
export function __resetNotificationsTableEnsuredForTests(): void {
  notificationsTableEnsured = false;
}

export async function ensureNotificationsTable(sql: Sql): Promise<void> {
  if (notificationsTableEnsured) return;
  await sql`CREATE TABLE IF NOT EXISTS upi_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
    order_no VARCHAR(32) NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('payment_received', 'order_created', 'utr_submitted', 'order_expired')),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    amount NUMERIC(12,2) NULL,
    dedupe_key VARCHAR(128) NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS upi_notifications_dedupe_key_unique
    ON upi_notifications (dedupe_key) WHERE dedupe_key IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS upi_notifications_user_created_idx
    ON upi_notifications (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS upi_notifications_user_unread_idx
    ON upi_notifications (user_id, is_read, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS upi_notifications_order_id_idx
    ON upi_notifications (order_id)`;
  await sql`CREATE TABLE IF NOT EXISTS upi_push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS upi_push_subscriptions_endpoint_unique
    ON upi_push_subscriptions (endpoint)`;
  await sql`CREATE INDEX IF NOT EXISTS upi_push_subscriptions_user_idx
    ON upi_push_subscriptions (user_id)`;
  notificationsTableEnsured = true;
}

/**
 * Insert one notification row. Deduped on `dedupe_key`: a repeat insert
 * returns the existing row instead of a duplicate. Throws only on a real
 * DB failure — callers in transition paths should use
 * createNotificationSafe() instead.
 */
export async function createNotification(
  sql: Sql,
  input: CreateNotificationInput,
): Promise<NotificationRow | null> {
  await ensureNotificationsTable(sql);
  const rows = await sql`
    INSERT INTO upi_notifications (user_id, order_id, order_no, type, title, body, amount, dedupe_key)
    VALUES (${input.userId}, ${input.orderId ?? null}, ${input.orderNo ?? null}, ${input.type},
      ${input.title}, ${input.body ?? ""}, ${input.amount ?? null}, ${input.dedupeKey ?? null})
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id, order_id, order_no, type, title, body, amount, is_read, read_at, created_at`;
  const inserted = (rows as NotificationRow[])[0];
  if (inserted) return inserted;
  if (!input.dedupeKey) return null;
  const existing = await sql`
    SELECT id, user_id, order_id, order_no, type, title, body, amount, is_read, read_at, created_at
    FROM upi_notifications WHERE dedupe_key = ${input.dedupeKey}`;
  return (existing as NotificationRow[])[0] ?? null;
}

/**
 * Best-effort wrapper for transition paths: creates the notification and
 * never throws — a notification failure must never block or roll back the
 * order transition that triggered it. Returns the row, or null when the
 * notification could not be created (including when no DB is configured).
 */
export async function createNotificationSafe(
  input: CreateNotificationInput,
  sqlOverride?: Sql,
): Promise<NotificationRow | null> {
  try {
    const sql = sqlOverride ?? getSql();
    return await createNotification(sql, input);
  } catch {
    return null;
  }
}

/** Convenience: build the copy for an order event and create it, best-effort. */
export async function notifyOrderEvent(
  type: NotificationType,
  order: Pick<OrderRow, "id" | "order_no" | "user_id" | "amount" | "payable_amount" | "utr_attempts">,
  opts: { via?: "provider" | "utr_review"; sqlOverride?: Sql } = {},
): Promise<NotificationRow | null> {
  const copy = buildNotification(type, order, opts);
  return createNotificationSafe(
    {
      userId: order.user_id,
      orderId: order.id,
      orderNo: order.order_no,
      type,
      title: copy.title,
      body: copy.body,
      amount: copy.amount,
      dedupeKey: copy.dedupeKey,
    },
    opts.sqlOverride,
  );
}

// --- Reads (API route) ------------------------------------------------------

export interface ListNotificationsOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}

export async function listNotifications(
  sql: Sql,
  userId: number,
  opts: ListNotificationsOptions = {},
): Promise<{ notifications: NotificationRow[]; unreadCount: number }> {
  await ensureNotificationsTable(sql);
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = opts.unreadOnly
    ? await sql`
        SELECT id, user_id, order_id, order_no, type, title, body, amount, is_read, read_at, created_at
        FROM upi_notifications WHERE user_id = ${userId} AND is_read = false
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
    : await sql`
        SELECT id, user_id, order_id, order_no, type, title, body, amount, is_read, read_at, created_at
        FROM upi_notifications WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const unread = await sql`
    SELECT COUNT(*)::int AS count FROM upi_notifications WHERE user_id = ${userId} AND is_read = false`;
  return {
    notifications: rows as NotificationRow[],
    unreadCount: Number((unread as { count: number }[])[0]?.count ?? 0),
  };
}

/**
 * Mark notifications read for one merchant. Either `all: true` or an
 * explicit list of ids (max 100, validated as integers — the list is
 * embedded as literals only after that validation). Returns the number
 * of rows marked. Never marks another merchant's rows (user_id guard).
 */
export async function markNotificationsRead(
  sql: Sql,
  userId: number,
  opts: { ids?: number[]; all?: boolean },
): Promise<number> {
  await ensureNotificationsTable(sql);
  if (opts.all) {
    const rows = await sql`
      UPDATE upi_notifications SET is_read = true, read_at = NOW()
      WHERE user_id = ${userId} AND is_read = false RETURNING id`;
    return (rows as unknown[]).length;
  }
  const ids = (opts.ids ?? []).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  if (ids.length === 0) return 0;
  // Integers only (validated above) — safe to embed as literals; the Neon
  // tagged template has no array-IN binding for a dynamic-length list.
  const list = ids.join(",");
  const rows = await sql.query(
    `UPDATE upi_notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND id IN (${list}) RETURNING id`,
    [userId],
  );
  return (rows as unknown[]).length;
}
