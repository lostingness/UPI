// Merchant-scoped reads for the dashboard UI (GAP 2).
//
// These are the backend-owned implementations behind the session-authenticated
// GET routes (GET /api/orders, GET /api/orders/[orderNo],
// GET /api/dashboard/stats, GET /api/settings). Every query is scoped by the
// session user's id in SQL; list results are additionally filtered in JS as
// defence-in-depth, so a row belonging to another merchant can never be
// returned even if a query is later refactored. Ownership failures are 404
// (never leak existence), matching the Laravel source behaviour.
import { getSql, first, type Row } from "./db";
import { ApiError } from "./errors";
import { dashboardStats } from "./dashboard";
import { loadOrderByNo, loadAccount } from "./orders/check";
import { getLogsForOrder, type WebhookLogRow } from "./webhooks/history";
import { toApiArray } from "./orders/serialize";
import { gatewayConfig } from "./config/gateway";
import type { OrderRow } from "./orders/types";

export type { WebhookLogRow };

export interface MerchantSettings {
  id: number; name: string; email: string; businessName: string | null; phone: string | null;
  apiKey: string | null; sandboxApiKey: string | null;
  webhookUrl: string | null; sandboxWebhookUrl: string | null;
  rotationMode: string; redirectDomains: string[];
}

export async function getMerchantSettings(userId: number): Promise<MerchantSettings | null> {
  const sql = getSql();
  const row = first<Row>(await sql`SELECT id, name, email, business_name, phone, api_key, sandbox_api_key,
    webhook_url, sandbox_webhook_url, rotation_mode, redirect_domains FROM users WHERE id = ${userId}`);
  if (!row) return null;
  return {
    id: Number(row.id), name: String(row.name), email: String(row.email),
    businessName: row.business_name ? String(row.business_name) : null,
    phone: row.phone ? String(row.phone) : null,
    apiKey: row.api_key ? String(row.api_key) : null,
    sandboxApiKey: row.sandbox_api_key ? String(row.sandbox_api_key) : null,
    webhookUrl: row.webhook_url ? String(row.webhook_url) : null,
    sandboxWebhookUrl: row.sandbox_webhook_url ? String(row.sandbox_webhook_url) : null,
    rotationMode: String(row.rotation_mode ?? "random"),
    redirectDomains: (row.redirect_domains as string[] | null) ?? [],
  };
}

export async function getMerchantDisplayName(userId: number): Promise<string> {
  const sql = getSql();
  const row = first<Row>(await sql`SELECT name, business_name FROM users WHERE id = ${userId}`);
  if (!row) return "Merchant";
  return String(row.business_name ?? row.name ?? "Merchant");
}

export interface OrderListItem extends Record<string, unknown> {
  order_no: string; client_order_id: string; amount: string; status: string;
  environment: string; customer_name: string | null; created_at: string;
  account_label: string | null; account_provider: string | null;
}

export interface MerchantOrderListOpts {
  environment: string; status: string; q: string; page: number;
}

export async function listMerchantOrders(
  userId: number,
  opts: MerchantOrderListOpts,
): Promise<{ orders: OrderListItem[]; counts: Record<string, number>; page: number; perPage: number }> {
  const sql = getSql();
  const perPage = 20;
  const page = Math.max(1, opts.page || 1);
  const rows = await sql`
    SELECT o.*, pa.label AS account_label, pa.provider AS account_provider FROM orders o
    LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id
    WHERE o.user_id = ${userId}
      AND (${opts.environment} = '' OR o.environment = ${opts.environment})
      AND (${opts.status} = '' OR o.status = ${opts.status})
      AND (${opts.q} = '' OR o.order_no ILIKE ${"%" + opts.q + "%"} OR o.client_order_id ILIKE ${"%" + opts.q + "%"} OR o.customer_utr ILIKE ${"%" + opts.q + "%"})
    ORDER BY o.created_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`;
  const countRows = await sql`
    SELECT status, COUNT(*) AS n FROM orders WHERE user_id = ${userId}
      AND (${opts.environment} = '' OR environment = ${opts.environment})
    GROUP BY status`;
  const counts: Record<string, number> = {};
  for (const r of countRows as Row[]) counts[String(r.status)] = Number(r.n);
  // Defence-in-depth: never return another merchant's row even if the SQL
  // above is ever refactored. (The WHERE user_id clause is the real guard.)
  const orders = (rows as unknown as (OrderListItem & { user_id: number | string })[])
    .filter((r) => Number(r.user_id) === userId);
  return { orders, counts, page, perPage };
}

export interface OrderDetail {
  order: OrderRow;
  account: { id: number; label: string; provider: string; upi_id: string | null; payee_name: string | null } | null;
  merchantName: string;
  webhookHistory: WebhookLogRow[];
  readOnly: boolean;
  api: Record<string, unknown>;
}

/**
 * Merchant order detail. Returns null when the order does not exist OR
 * belongs to another merchant (404 semantics — never leak existence).
 * Admins have their own read-only route (/api/admin/orders/[orderNo]) and
 * must not use this merchant route to read another merchant's order.
 */
export async function getMerchantOrderDetail(orderNo: string, userId: number): Promise<OrderDetail | null> {
  const order = await loadOrderByNo(orderNo);
  if (!order) return null;
  if (Number(order.user_id) !== userId) return null;
  const account = await loadAccount(order.payment_account_id);
  const merchantName = await getMerchantDisplayName(order.user_id);
  const webhookHistory = await getLogsForOrder(order.id, 25);
  const api = toApiArray(
    order,
    account ? { provider: account.provider, upi_id: account.upi_id, payee_name: account.payee_name } : null,
    gatewayConfig.appUrl,
  );
  return {
    order, merchantName, webhookHistory, api,
    account: account ? { id: account.id, label: account.label, provider: account.provider, upi_id: account.upi_id, payee_name: account.payee_name } : null,
    readOnly: order.environment === "sandbox",
  };
}

export async function getMerchantDashboard(userId: number, environment: "live" | "sandbox") {
  return dashboardStats(userId, environment);
}

/**
 * Session order-creation ownership check (GAP 1): a payment_account_id that
 * exists but belongs to another merchant is a 422. A nonexistent id is left
 * for createOrder/resolveAccount, which rejects it with 422.
 * Round 7 (L1): was 403 — a 403 vs 422 difference let an attacker
 * distinguish "account exists, belongs to someone else" (403) from
 * "account does not exist" (422). Both cases are now 422 with the same
 * generic message, so existence/ownership cannot be probed.
 */
export async function assertAccountOwnedBy(userId: number, accountId: number): Promise<void> {
  const sql = getSql();
  const row = first<Row>(await sql`SELECT id, user_id FROM payment_accounts WHERE id = ${accountId}`);
  if (row && Number(row.user_id) !== userId) {
    throw new ApiError(422, "Payment account does not belong to this merchant.");
  }
}
