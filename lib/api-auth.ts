// API-key auth for /api/v1/* — port of AuthenticateApiKey middleware.
// Headers X-Api-Key / X-Api-Secret; key prefix selects environment
// (test_key_ → sandbox, else live). Secrets are stored encrypted in users;
// comparison is constant-time (timingSafeEqual). 401 invalid, 403 disabled
// merchant. Every API response carries X-Request-Id (UUID).
import { timingSafeEqual, decryptText } from "./crypto";
import { getSql, first, type Row } from "./db";
import { ApiError } from "./errors";
import { gatewayConfig } from "./config/gateway";
import { checkDbRateLimit, checkMemoryRateLimit, getClientIp, rateLimitHeaders, apiKeyLimit, apiIpLimit, failedAuthLimit } from "./rate-limit";

export interface ApiMerchant {
  id: number; email: string; name: string; role: string; isActive: boolean;
  environment: "live" | "sandbox";
  webhookUrl: string | null; webhookSecret: string | null;
  redirectDomains: string[]; rotationMode: "random" | "default";
}

export function requestId(): string { return crypto.randomUUID(); }

export async function authenticateApiKey(req: Request): Promise<ApiMerchant> {
  const ip = getClientIp(req);
  const key = req.headers.get("x-api-key") ?? "";
  const secret = req.headers.get("x-api-secret") ?? "";
  if (!key || !secret) {
    await recordFailedAuth(ip);
    throw new ApiError(401, "Invalid API credentials");
  }
  const sandbox = key.startsWith("test_key_");
  const sql = getSql();
  // Column name is a fixed literal per branch, never from input.
  const row = sandbox
    ? first<Row>(await sql`SELECT id, name, email, role, is_active, api_secret, sandbox_api_secret, webhook_url, sandbox_webhook_url, webhook_secret, sandbox_webhook_secret, redirect_domains, rotation_mode FROM users WHERE sandbox_api_key = ${key}`)
    : first<Row>(await sql`SELECT id, name, email, role, is_active, api_secret, sandbox_api_secret, webhook_url, sandbox_webhook_url, webhook_secret, sandbox_webhook_secret, redirect_domains, rotation_mode FROM users WHERE api_key = ${key}`);
  if (!row) { await recordFailedAuth(ip); throw new ApiError(401, "Invalid API credentials"); }
  const storedEnc = sandbox ? String(row.sandbox_api_secret ?? "") : String(row.api_secret ?? "");
  let stored = "";
  try { stored = decryptText(storedEnc) ?? ""; } catch { stored = ""; }
  if (!stored || !timingSafeEqual(stored, secret)) {
    await recordFailedAuth(ip);
    throw new ApiError(401, "Invalid API credentials");
  }
  if (row.is_active !== true) throw new ApiError(403, "Merchant account is disabled");
  // Round 7 (L4): API keys are merchant-scoped. An admin's key must not
  // authenticate the merchant v1 API — admin access is session-only
  // (requireAdmin / requireAdminConfirmed). Without this, an admin key
  // could create orders and read merchant-scoped data as if it were a
  // merchant account.
  if (String(row.role) !== "merchant") throw new ApiError(403, "API keys are merchant-scoped");
  // Per-IP limit (best-effort in-memory + DB when configured).
  const ipCheck = checkMemoryRateLimit(`api:ip:${ip}`, apiIpLimit());
  if (!ipCheck.allowed) throw new ApiError(429, "Too many requests");
  return {
    id: Number(row.id), email: String(row.email), name: String(row.name), role: String(row.role),
    isActive: true, environment: sandbox ? "sandbox" : "live",
    webhookUrl: sandbox ? (row.sandbox_webhook_url as string | null) : (row.webhook_url as string | null),
    webhookSecret: null, // resolved at delivery time from the merchant row
    redirectDomains: (row.redirect_domains as string[] | null) ?? [],
    rotationMode: row.rotation_mode === "default" ? "default" : "random",
  };
}

async function recordFailedAuth(ip: string): Promise<void> {
  const r = checkMemoryRateLimit(`api:failed-auth:${ip}`, failedAuthLimit());
  if (!r.allowed) throw new ApiError(429, "Too many failed authentication attempts");
}

export function isRedirectUrlAllowed(url: string, domains: string[]): boolean {
  if (!domains.length) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((d) => { const dd = d.toLowerCase(); return host === dd || host.endsWith(`.${dd}`); });
  } catch { return false; }
}

/**
 * GAP 3 — the redirect a route hands back must pass the SAME allowlist the
 * /api/pay/[orderNo]/return route enforces. Only a paid order with an
 * allowlisted redirect_url yields a URL; everything else yields null.
 * Used by GET /api/pay/[orderNo]/status (and tested in
 * tests/merchant-session-orders.test.ts).
 */
export function allowedRedirectForStatus(
  order: { status: string; redirect_url: string | null },
  domains: string[],
): string | null {
  if (order.status !== "paid" || !order.redirect_url) return null;
  return isRedirectUrlAllowed(order.redirect_url, domains) ? order.redirect_url : null;
}

export { rateLimitHeaders, apiKeyLimit };
export const _gateway = gatewayConfig;
