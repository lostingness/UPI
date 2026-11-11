// Server-only data layer for pages.
//
// Merchant reads go through the backend's own session-authenticated GET
// routes (GET /api/orders, /api/orders/[orderNo], /api/dashboard/stats,
// /api/settings, /api/accounts, /api/admin/merchants) via a server-side
// fetch with the session cookie forwarded — pages never import the Neon
// client or write SQL themselves, and never query from client components.
// The former placeholder SELECTs (listMerchantOrders, listAdminMerchants)
// are gone; the remaining SQL in this file belongs to admin-only helpers
// whose admin API routes already exist but whose pages still compose the
// data server-side (adminOverview, debugger, outbox, audit logs).
// Checkout (getPayData) still uses backend lib helpers directly — it is a
// public page, not a merchant UI read.
import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, requireAdminConfirmed, type SessionUser } from "@/lib/auth";
import { getSql, isDbConfigured, first, type Row } from "@/lib/db";
import { getMerchantDisplayName } from "@/lib/merchant-orders";
import { allowedRedirectForStatus } from "@/lib/api-auth";
import type { OrderDetail } from "@/lib/merchant-orders";
import { loadOrderByNo, loadAccount } from "@/lib/orders/check";
import { getLogsForOrder, type WebhookLogRow } from "@/lib/webhooks/history";
import { toApiArray } from "@/lib/orders/serialize";
import { acceptsCustomerUtr, canRecoverLatePayment, type OrderRow } from "@/lib/orders/types";
import { gatewayConfig } from "@/lib/config/gateway";
import { isInstalled } from "@/lib/install";
import { auditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

export type { SessionUser };
export type { OrderRow, WebhookLogRow };
export type { OrderDetail };
export { getMerchantDisplayName };

export function dbConfigured(): boolean {
  return isDbConfigured();
}

export async function getSessionSafe(): Promise<SessionUser | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

export async function getInstallState(): Promise<{ installed: boolean; databaseConfigured: boolean }> {
  let installed = false;
  try { installed = await isInstalled(); } catch { installed = false; }
  return { installed, databaseConfigured: isDbConfigured() };
}

export function allowRegistration(): boolean {
  return gatewayConfig.allowRegistration;
}

export function appName(): string {
  return gatewayConfig.appName;
}

/** Guard helper for authed pages: redirect to /login?next=… when signed out. */
export function requireUser(user: SessionUser | null, next: string): SessionUser {
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

// ------------------------------------------------------- internal API fetch
// Server-side fetch to the app's own session-authenticated API routes.
// The session cookie is forwarded from the incoming request; the base URL
// is derived from the request host so it works on any port/domain (and
// falls back to APP_URL when no request scope exists, e.g. build time).
async function apiBase(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch { /* no request scope — fall through to APP_URL */ }
  return gatewayConfig.appUrl.replace(/\/$/, "");
}

async function fetchApi<T>(path: string): Promise<T | null> {
  const h = await headers();
  const res = await fetch(`${await apiBase()}${path}`, {
    headers: { cookie: h.get("cookie") ?? "", accept: "application/json" },
    cache: "no-store",
  });
  // 404/401/403 → null: the caller decides (detail/settings pages show
  // notFound / "could not load"; listAdminMerchants relies on this because
  // the admin merchants page fetches before AdminShell runs the 900 s
  // password-confirm gate — a 401 there means "confirm first", not a crash).
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`API ${path} failed (${res.status})`);
  const body = (await res.json()) as { success: boolean; data: T };
  return body.data as T;
}

// ---------------------------------------------------------------- merchant
export interface MerchantSettings {
  id: number; name: string; email: string; businessName: string | null; phone: string | null;
  apiKey: string | null; sandboxApiKey: string | null;
  webhookUrl: string | null; sandboxWebhookUrl: string | null;
  rotationMode: string; redirectDomains: string[];
}

export async function getMerchantSettings(_userId: number): Promise<MerchantSettings | null> {
  // Merchant-scoped by the session on GET /api/settings; _userId is kept
  // for the existing call signature (callers already pass the session user).
  return fetchApi<MerchantSettings>("/api/settings");
}

export interface OrderListItem extends Record<string, unknown> {
  order_no: string; client_order_id: string; amount: string; status: string;
  environment: string; customer_name: string | null; created_at: string;
  account_label: string | null; account_provider: string | null;
}

export async function listMerchantOrders(
  _userId: number,
  opts: { environment: string; status: string; q: string; page: number },
): Promise<{ orders: OrderListItem[]; counts: Record<string, number>; page: number; perPage: number }> {
  const p = new URLSearchParams();
  if (opts.environment) p.set("environment", opts.environment);
  if (opts.status) p.set("status", opts.status);
  if (opts.q) p.set("q", opts.q);
  p.set("page", String(Math.max(1, opts.page || 1)));
  const data = await fetchApi<{ orders: OrderListItem[]; counts: Record<string, number>; page: number; perPage: number }>(`/api/orders?${p.toString()}`);
  if (!data) throw new Error("Order list unavailable");
  return data;
}

export async function getOrderDetail(orderNo: string, _user: SessionUser): Promise<OrderDetail | null> {
  // Merchant-scoped by the session on GET /api/orders/[orderNo]; another
  // merchant's order is 404 (null here → page shows notFound).
  return fetchApi<OrderDetail>(`/api/orders/${encodeURIComponent(orderNo)}`);
}

export interface DashboardStats {
  paidCount: number; pendingCount: number; reviewCount: number; closedCount: number;
  totalAmount: number; todayAmount: number; todayCount: number; successRate: number | null;
  chart7d: { date: string; amount: number; count: number }[];
  recentOrders: OrderListItem[];
}

export async function getDashboard(userId: number, environment: "live" | "sandbox") {
  const [stats, accounts, settings] = await Promise.all([
    fetchApi<DashboardStats>(`/api/dashboard/stats?environment=${environment}`),
    fetchApi<AccountWithUsage[]>("/api/accounts"),
    fetchApi<MerchantSettings>("/api/settings"),
  ]);
  if (!stats) throw new Error("Dashboard stats unavailable");
  const accountList = accounts ?? [];
  const checklist = environment === "live"
    ? [
        { label: "Add your first UPI account", done: accountList.length > 0, url: "/accounts/new" },
        { label: "Set your webhook URL", done: Boolean(settings?.webhookUrl), url: "/settings" },
        { label: "Receive your first payment", done: stats.paidCount > 0, url: "/orders" },
      ]
    : [
        { label: "Sandbox API credentials ready", done: Boolean(settings?.sandboxApiKey), url: "/settings" },
        { label: "Set your sandbox webhook URL", done: Boolean(settings?.sandboxWebhookUrl), url: "/settings" },
        { label: "Simulate your first TEST payment", done: stats.paidCount > 0, url: "/sandbox" },
      ];
  return { ...stats, accounts: accountList, settings, checklist };
}

export interface AccountWithUsage {
  id: number; label: string; provider: string; upi_id: string | null; payee_name: string | null;
  is_active: boolean; is_default: boolean; daily_limit: string | null; created_at: string;
  used_today: number; remaining_today: number | null;
}

export async function getAccountsWithUsage(_userId: number): Promise<AccountWithUsage[]> {
  return (await fetchApi<AccountWithUsage[]>("/api/accounts")) ?? [];
}

// ---------------------------------------------------------------- checkout
export interface PayData {
  order: OrderRow;
  account: { provider: string; upi_id: string | null; payee_name: string | null; label: string } | null;
  merchantName: string;
  api: Record<string, unknown>;
  hosted: boolean;
  acceptsUtr: boolean;
  canRecover: boolean;
  lateRecoveryUntil: string | null;
  /**
   * Allowlisted merchant redirect only (same helper as the status route):
   * the raw order.redirect_url when paid AND its host is in the merchant's
   * redirect_domains, else null. The pay page renders this — never the raw
   * order.redirect_url — so a tampered client cannot re-enable a
   * non-allowlisted link; the client only ever receives null or an
   * allowlisted URL.
   */
  redirectUrl: string | null;
}

export async function getPayData(orderNo: string): Promise<PayData | null> {
  const order = await loadOrderByNo(orderNo);
  if (!order) return null;
  const account = await loadAccount(order.payment_account_id);
  const merchantName = await getMerchantDisplayName(order.user_id);
  // Server-side allowlist gate (same query + helper as the status route):
  // only a paid order whose redirect_url host is in the merchant's
  // redirect_domains yields a URL; everything else yields null.
  const sql = getSql();
  const user = first<Row>(await sql`SELECT redirect_domains FROM users WHERE id = ${order.user_id}`);
  const domains = (user?.redirect_domains as string[] | null) ?? [];
  const redirectUrl = allowedRedirectForStatus(order, domains);
  const api = toApiArray(
    order,
    account ? { provider: account.provider, upi_id: account.upi_id, payee_name: account.payee_name } : null,
    gatewayConfig.appUrl,
  );
  const hosted = account ? ["paytm_pg", "phonepe_pg"].includes(account.provider) : false;
  const acceptsUtr = acceptsCustomerUtr(order, account?.provider ?? null);
  const canRecover = canRecoverLatePayment(order, gatewayConfig.latePaymentGraceHours);
  const lateUntil = order.original_expires_at
    ? new Date(new Date(order.original_expires_at).getTime() + gatewayConfig.latePaymentGraceHours * 3600 * 1000).toISOString()
    : null;
  return {
    order, merchantName, api, hosted, acceptsUtr, canRecover, lateRecoveryUntil: lateUntil, redirectUrl,
    account: account ? { provider: account.provider, upi_id: account.upi_id, payee_name: account.payee_name, label: account.label } : null,
  };
}

// ---------------------------------------------------------------- admin
export async function requireAdminPage(): Promise<SessionUser | null> {
  try {
    return await requireAdminConfirmed();
  } catch {
    return null;
  }
}

export async function adminOverview() {
  const sql = getSql();
  const row = first<Row>(await sql`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'merchant') AS merchants,
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS paid_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'review') AS review_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
      (SELECT COUNT(*) FROM payment_accounts) AS accounts,
      (SELECT COUNT(*) FROM webhook_outbox WHERE status IN ('pending','failed')) AS outbox_open,
      (SELECT COUNT(*) FROM admin_audit_logs) AS audit_count`);
  const review = await sql`
    SELECT o.*, u.name AS merchant_name FROM orders o LEFT JOIN users u ON u.id = o.user_id
    WHERE o.status = 'review' ORDER BY o.created_at DESC LIMIT 20`;
  const recentAudit = await sql`SELECT * FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT 10`;
  return {
    merchants: Number(row?.merchants ?? 0),
    orders: Number(row?.orders ?? 0),
    paidOrders: Number(row?.paid_orders ?? 0),
    reviewOrders: Number(row?.review_orders ?? 0),
    pendingOrders: Number(row?.pending_orders ?? 0),
    accounts: Number(row?.accounts ?? 0),
    outboxOpen: Number(row?.outbox_open ?? 0),
    auditCount: Number(row?.audit_count ?? 0),
    reviewQueue: review as unknown as OrderListItem[],
    recentAudit: recentAudit as Row[],
  };
}

export async function listAdminMerchants(page: number) {
  // Former placeholder SELECT — now a fetch to the existing admin route
  // GET /api/admin/merchants (admin + password-confirmed session).
  // NOTE: this page fetches before AdminShell runs the 900 s confirm gate,
  // so an unconfirmed admin gets null here (not a throw) and AdminShell
  // then shows the "Password confirmation required" prompt.
  const p = Math.max(1, page || 1);
  const merchants = await fetchApi<Row[]>(`/api/admin/merchants?page=${p}`);
  return { merchants: merchants ?? [], page: p };
}

export async function listAdminOrders(status: string, page: number) {
  const sql = getSql();
  const p = Math.max(1, page || 1);
  const rows = status
    ? await sql`SELECT o.*, u.name AS merchant_name, u.email AS merchant_email, pa.label AS account_label FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id WHERE o.status = ${status} ORDER BY o.created_at DESC LIMIT 30 OFFSET ${(p - 1) * 30}`
    : await sql`SELECT o.*, u.name AS merchant_name, u.email AS merchant_email, pa.label AS account_label FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id ORDER BY o.created_at DESC LIMIT 30 OFFSET ${(p - 1) * 30}`;
  return { orders: rows as unknown as OrderListItem[], page: p };
}

export async function getAdminOrderDetail(orderNo: string, adminId: number, ip: string | null) {
  const order = await loadOrderByNo(orderNo);
  if (!order) return null;
  const sql = getSql();
  // Same audit the API route performs on every admin order view.
  await auditLog(sql, adminId, "order_viewed", "order", order.id, { order_no: order.order_no, merchant_id: order.user_id }, ip);
  const account = await loadAccount(order.payment_account_id);
  const merchant = first<Row>(await sql`SELECT id, name, email, business_name FROM users WHERE id = ${order.user_id}`);
  const webhookHistory = await getLogsForOrder(order.id, 25);
  return {
    order, webhookHistory,
    merchant: merchant ? { id: Number(merchant.id), name: String(merchant.name), email: String(merchant.email), businessName: merchant.business_name ? String(merchant.business_name) : null } : null,
    account: account ? { id: account.id, label: account.label, provider: account.provider, upi_id: account.upi_id, payee_name: account.payee_name } : null,
  };
}

export async function listOutbox(status: string) {
  const sql = getSql();
  const rows = status
    ? await sql`SELECT wo.*, o.order_no FROM webhook_outbox wo LEFT JOIN orders o ON o.id = wo.order_id WHERE wo.status = ${status} ORDER BY wo.available_at NULLS FIRST, wo.id DESC LIMIT 100`
    : await sql`SELECT wo.*, o.order_no FROM webhook_outbox wo LEFT JOIN orders o ON o.id = wo.order_id ORDER BY wo.available_at NULLS FIRST, wo.id DESC LIMIT 100`;
  return rows as Row[];
}

export async function listAuditLogs(page: number) {
  const sql = getSql();
  const p = Math.max(1, page || 1);
  const rows = await sql`SELECT * FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ${(p - 1) * 50}`;
  return { logs: rows as Row[], page: p };
}

export interface DebuggerRow extends Record<string, unknown> {
  order_no: string; client_order_id: string; amount: string; status: string;
  environment: string; created_at: string; merchant_name: string | null;
  merchant_email: string | null; account_label: string | null; account_provider: string | null;
  webhook_logs_count: string;
}

export async function listDebugger(opts: { q: string; status: string; provider: string; environment: string; dateFrom: string; dateTo: string; page: number }) {
  const sql = getSql();
  const p = Math.max(1, opts.page || 1);
  const rows = await sql`
    SELECT o.*, u.name AS merchant_name, u.email AS merchant_email,
      pa.id AS account_id, pa.label AS account_label, pa.provider AS account_provider,
      (SELECT COUNT(*) FROM webhook_logs wl WHERE wl.order_id = o.id) AS webhook_logs_count
    FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id
    WHERE (${opts.q} = '' OR o.order_no ILIKE ${"%" + opts.q + "%"} OR o.client_order_id ILIKE ${"%" + opts.q + "%"} OR o.customer_utr ILIKE ${"%" + opts.q + "%"})
      AND (${opts.status} = '' OR o.status = ${opts.status})
      AND (${opts.provider} = '' OR pa.provider = ${opts.provider})
      AND (${opts.environment} = '' OR o.environment = ${opts.environment})
      AND (${opts.dateFrom} = '' OR o.created_at >= ${opts.dateFrom})
      AND (${opts.dateTo} = '' OR o.created_at < ${opts.dateTo}::date + INTERVAL '1 day')
    ORDER BY o.created_at DESC LIMIT 25 OFFSET ${(p - 1) * 25}`;
  return { orders: rows as unknown as DebuggerRow[], page: p };
}

function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const [l, d] = e.split("@");
  return `${l[0] ?? ""}***@${d ?? ""}`;
}
function maskMobile(m: string | null): string | null { return m ? `******${m.slice(-4)}` : null; }
function maskName(n: string | null): string | null { return n ? `${n[0]}***` : null; }
function sanitizeError(raw: unknown): string | null {
  if (!raw) return null;
  let s = typeof raw === "string" ? raw : JSON.stringify(raw);
  s = s.replace(/<[^>]*>/g, "").replace(/https?:\/\/[^\s]+/g, "[url]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[email]")
    .replace(/\b\d{12,}\b/g, "[number]");
  return s.slice(0, 240);
}

export async function getDebuggerDetail(orderNo: string, adminId: number, ip: string | null) {
  const order = await loadOrderByNo(orderNo);
  if (!order) return null;
  const sql = getSql();
  await auditLog(sql, adminId, "transaction_debugger_viewed", "order", order.id, { order_no: order.order_no, merchant_id: order.user_id }, ip);
  const account = order.payment_account_id ? first<Row>(await sql`SELECT id, label, provider FROM payment_accounts WHERE id = ${order.payment_account_id}`) : null;
  const merchant = first<Row>(await sql`SELECT id, name, email FROM users WHERE id = ${order.user_id}`);
  const logs = await getLogsForOrder(order.id, 25);
  const providerError = sanitizeError(
    (order.provider_response as Record<string, unknown> | null)?.error ??
    (order.provider_response as Record<string, unknown> | null)?.message,
  );
  const timeline = [
    { at: order.created_at, event: "created" },
    ...(order.utr_submitted_at ? [{ at: order.utr_submitted_at, event: "utr_submitted" }] : []),
    ...(order.paid_at ? [{ at: order.paid_at, event: "paid" }] : []),
    ...logs.map((l) => ({ at: l.created_at, event: `webhook:${l.event}:${l.success ? "delivered" : "attempt"}` })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return {
    order: { ...order, customer_name: maskName(order.customer_name), customer_email: maskEmail(order.customer_email), customer_mobile: maskMobile(order.customer_mobile) },
    merchant: merchant ? { id: Number(merchant.id), name: maskName(String(merchant.name)), email: maskEmail(String(merchant.email)) } : null,
    account: account ? { id: Number(account.id), label: String(account.label), provider: String(account.provider) } : null,
    providerError, timeline, webhookLogs: logs,
  };
}

export async function listAllAccounts() {
  const sql = getSql();
  const rows = await sql`SELECT pa.*, u.name AS merchant_name, u.email AS merchant_email FROM payment_accounts pa LEFT JOIN users u ON u.id = pa.user_id ORDER BY pa.created_at DESC LIMIT 100`;
  return (rows as Record<string, unknown>[]).map(({ credentials, ...r }) => r);
}

export { getClientIp };
