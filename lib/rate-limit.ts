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

/** DB-backed fixed-window counter in `upi_rate_limits` (durable across instances).
 * Fixed window: window_start = floor(now / window) * window. A stored
 * window_start from an earlier window resets the counter to 1; within the
 * same window the counter increments. (Previously this computed a sliding
 * window_start = now - window, which never aligned windows and let a
 * bucket's count carry across window boundaries.) */
export async function checkDbRateLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  const sql = getSql();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  // Single statement: insert-or-bump the counter for this window, then read it.
  const rows = await sql`
    INSERT INTO upi_rate_limits (bucket_key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (bucket_key) DO UPDATE SET count = CASE WHEN upi_rate_limits.window_start < ${windowStart} THEN 1 ELSE upi_rate_limits.count + 1 END,
      window_start = CASE WHEN upi_rate_limits.window_start < ${windowStart} THEN ${windowStart} ELSE upi_rate_limits.window_start END
    RETURNING count`;
  const count = Number((rows as { count: number }[])[0]?.count ?? 1);
  const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - Date.now()) / 1000);
  if (count > limit) return { allowed: false, limit, remaining: 0, retryAfterSeconds };
  return { allowed: true, limit, remaining: limit - count };
}

/** Durable limiter with an in-memory fallback: when the DB is not
 * configured (or the DB call fails), the per-instance memory bucket is
 * used instead of failing the request. Callers must not rely on the
 * durable bucket alone in tests / without DATABASE_URL. */
export async function checkDurableRateLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  try {
    return await checkDbRateLimit(key, limit, windowSeconds);
  } catch {
    return checkMemoryRateLimit(key, limit, windowSeconds);
  }
}

/** Two-layer check: cheap per-instance memory bucket first, then the
 * durable DB bucket. The memory bucket is a first line of defence, never
 * the only line — the DB bucket is what holds across Vercel instances.
 * The two layers use distinct key prefixes so the fallback path does not
 * double-count the same memory bucket. */
export async function checkTwoLayerRateLimit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  const mem = checkMemoryRateLimit(`mem:${key}`, limit, windowSeconds);
  if (!mem.allowed) return mem;
  return checkDurableRateLimit(`db:${key}`, limit, windowSeconds);
}

export function getClientIp(req: Request): string {
  // NOTE: X-Forwarded-For is client-controlled unless a trusted proxy
  // strips/sets it. On Vercel the platform sets it, but the value must
  // still be treated as ADVISORY — it is only ever used for rate limiting
  // and audit metadata, never for authentication or authorisation. A
  // spoofed IP can at most shift which rate-limit bucket a request lands
  // in; it cannot bypass the per-key / per-account limits.
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
