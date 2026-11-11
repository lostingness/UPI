// Rate limiting.
//
// NOTE (Vercel serverless limits): an in-memory bucket is per-instance only —
// on Vercel each invocation may run on a different instance, so in-memory
// limits are best-effort. Durable limits live in Neon (`upi_rate_limits`,
// migration 012) via `checkDbRateLimit`, used for the API-key / per-IP buckets
// that matter (order creation, failed auth). The in-memory limiter is kept for
// cheap per-instance burst protection and for tests.
import { getSql } from "./db";
import { gatewayConfig } from "./config/gateway";

export interface RateLimitResult { allowed: boolean; limit: number; remaining: number; retryAfterSeconds?: number; }

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkMemoryRateLimit(key: string, limit: number, windowSeconds = 60): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, limit, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { allowed: true, limit, remaining: limit - b.count };
}

/** DB-backed fixed-window counter in `upi_rate_limits` (durable across instances). */
export async function checkDbRateLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  const sql = getSql();
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
  // Single statement: insert-or-bump the counter for this window, then read it.
  const rows = await sql`
    INSERT INTO upi_rate_limits (bucket_key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (bucket_key) DO UPDATE SET count = CASE WHEN upi_rate_limits.window_start < ${windowStart} THEN 1 ELSE upi_rate_limits.count + 1 END,
      window_start = CASE WHEN upi_rate_limits.window_start < ${windowStart} THEN ${windowStart} ELSE upi_rate_limits.window_start END
    RETURNING count`;
  const count = Number((rows as { count: number }[])[0]?.count ?? 1);
  if (count > limit) return { allowed: false, limit, remaining: 0, retryAfterSeconds: windowSeconds };
  return { allowed: true, limit, remaining: limit - count };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
  };
  if (!r.allowed && r.retryAfterSeconds) h["Retry-After"] = String(r.retryAfterSeconds);
  return h;
}

export const apiKeyLimit = () => gatewayConfig.apiKeyRateLimit;
export const orderCreateLimit = () => gatewayConfig.orderCreateApiKeyRateLimit;
export const apiIpLimit = () => gatewayConfig.apiIpRateLimit;
export const failedAuthLimit = () => gatewayConfig.apiFailedAuthIpRateLimit;
