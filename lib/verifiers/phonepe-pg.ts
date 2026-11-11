// PhonePePgVerifier — port of PhonePePgVerifier.php (official PhonePe PG v2).
// OAuth client-credentials token (cached in-memory, TTL = expires_at - now - 60,
// min 60 s; on 401 refresh once and retry), then:
// startCheckout: POST {base}/checkout/v2/pay → redirectUrl
//   {type:'redirect', url, expires_at}
// check: GET {base}/checkout/v2/order/{order_no}/status?details=false
//   state === 'COMPLETED' + merchantOrderId (NOT orderId — that's PhonePe's
//   internal id) + amount paise (ctype_digit int) + currency INR + first
//   COMPLETED paymentDetails entry's rail.utr or transactionId/orderId.
// HTTP timeout 15 s. Errors → pending, never a throw for not-paid.
import { gatewayConfig } from "../config/gateway";
import { VerificationResult, toPaise, extractRawTimestamp, type OrderLike, type VerificationResult as VR } from "./verification-result";
import type { AccountLike, FetchFn } from "./paytm-business";
import type { HostedCheckoutResult } from "./hosted-checkout";

interface PhonePeUrls { tokenUrl: string; baseUrl: string; }
export function phonePeUrls(account: AccountLike): PhonePeUrls {
  return account.credentials.environment === "production" ? gatewayConfig.phonepeProduction : gatewayConfig.phonepeSandbox;
}

// In-memory token cache (per client_id+secret hash). NOTE: per-instance only;
// on Vercel a token may be re-fetched on another instance — harmless (OAuth
// tokens are cheap and the 60 s safety margin is kept). A Neon-backed cache
// (upi_cache, migration 012) can replace this if token churn is observed.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
export function __clearPhonePeTokenCache() { tokenCache.clear(); }

async function getPhonePeToken(account: AccountLike, fetchFn: FetchFn): Promise<string> {
  const { client_id, client_secret, client_version } = account.credentials;
  if (!client_id || !client_secret) throw new Error("PhonePe credentials not configured");
  const { sha256Hex } = await import("../crypto");
  const cacheKey = sha256Hex(`${client_id}${client_secret}`);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const { tokenUrl } = phonePeUrls(account);
  const res = await fetchFn(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_version: client_version ?? "1", client_secret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  const token = data.access_token as string;
  if (!token) throw new Error("PhonePe OAuth token request failed");
  const ttlMs = Math.max(60_000, ((data.expires_at as number) ? (data.expires_at as number) * 1000 - Date.now() : 3600_000) - 60_000);
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttlMs });
  return token;
}

async function phonePeRequest(account: AccountLike, fn: (token: string, base: string) => Promise<Response>, fetchFn: FetchFn, retried = false): Promise<Record<string, unknown>> {
  const token = await getPhonePeToken(account, fetchFn);
  const { baseUrl } = phonePeUrls(account);
  let res = await fn(token, baseUrl);
  if (res.status === 401 && !retried) {
    const { sha256Hex } = await import("../crypto");
    tokenCache.delete(sha256Hex(`${account.credentials.client_id}${account.credentials.client_secret}`));
    res = await fn(await getPhonePeToken(account, fetchFn), baseUrl);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function startPhonePeCheckout(order: OrderLike, account: AccountLike, returnUrl: string, fetchFn: FetchFn = fetch): Promise<HostedCheckoutResult> {
  const secondsLeft = Math.max(0, Math.floor((new Date(order.expires_at ?? Date.now()).getTime() - Date.now()) / 1000));
  const data = await phonePeRequest(account, async (token, base) => fetchFn(`${base}/checkout/v2/pay`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `O-Bearer ${token}` },
    body: JSON.stringify({
      merchantOrderId: order.order_no, amount: toPaise(order.amount),
      expireAfter: Math.max(300, Math.min(3600, secondsLeft)),
      paymentFlow: { type: "PG_CHECKOUT", message: (order as unknown as { note?: string }).note || `Payment for ${(order as unknown as { client_order_id: string }).client_order_id}`, merchantUrls: { redirectUrl: returnUrl } },
      metaInfo: { udf1: (order as unknown as { client_order_id: string }).client_order_id },
    }),
    signal: AbortSignal.timeout(15000),
  }), fetchFn);
  const url = data.redirectUrl as string | undefined;
  if (!url) throw new Error("PhonePe could not start the payment. Please try again.");
  const expireAt = typeof data.expireAt === "number" ? Math.floor(data.expireAt / 1000) : Math.floor(Date.now() / 1000) + 15 * 60;
  return { type: "redirect", url, expires_at: expireAt };
}

export async function checkPhonePePg(order: OrderLike, account: AccountLike | null, fetchFn: FetchFn = fetch): Promise<VR> {
  if (!account) return VerificationResult.pending({ error: "A matching payment account is required.", code: "missing_account" });
  let data: Record<string, unknown>;
  try {
    data = await phonePeRequest(account, async (token, base) => fetchFn(`${base}/checkout/v2/order/${encodeURIComponent(order.order_no)}/status?details=false`, {
      headers: { Authorization: `O-Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    }), fetchFn);
  } catch (e) {
    return VerificationResult.pending({ error: (e as Error).message });
  }
  if (data.state !== "COMPLETED") return VerificationResult.pending(data);
  if (data.merchantOrderId !== order.order_no) return VerificationResult.pending({ error: "Order ID mismatch" });
  if (!/^\d+$/.test(String(data.amount ?? "")) || Number(data.amount) !== toPaise(order.amount)) {
    return VerificationResult.pending({ error: "Amount mismatch" });
  }
  const details = Array.isArray(data.paymentDetails) ? data.paymentDetails : [];
  const payment = (details.find((d) => (d as Record<string, unknown>).state === "COMPLETED") ?? {}) as Record<string, unknown>;
  if ((data.currency ?? "INR") !== "INR") return VerificationResult.pending({ error: "Currency mismatch" });
  const utr = (payment.rail as Record<string, unknown> | undefined)?.utr as string | undefined;
  const txnId = (payment.transactionId as string) || (data.orderId as string) || "";
  if (!String(utr ?? "").trim() && !String(txnId).trim()) return VerificationResult.pending({ error: "Missing transaction reference" });
  const occurredAt = extractRawTimestamp("phonepe_pg", data);
  if (!occurredAt && gatewayConfig.evidenceRequireTimestamp) {
    return VerificationResult.pending({ error: "Missing or invalid provider transaction timestamp" });
  }
  return VerificationResult.fromPhonePePg(order, Number(data.amount) / 100, utr ?? null, txnId || null, data, (data.currency as string) ?? "INR", occurredAt, account.id, account.environment);
}
