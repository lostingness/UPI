import { NextResponse } from "next/server";
import { loadOrderByNo, loadAccount, checkOrder } from "@/lib/orders/check";
import { RETURN_FORCE_BUDGET, RETURN_FORCE_WINDOW_SECONDS } from "@/lib/pay-token";
import { checkDurableRateLimit } from "@/lib/rate-limit";
import { gatewayConfig } from "@/lib/config/gateway";
import { getSql, first, type Row } from "@/lib/db";
import { decryptAccountCredentials } from "@/lib/orders/create";
import { verifyPaytmChecksum } from "@/lib/verifiers/paytm-checksum";
export const dynamic = "force-dynamic";
// GET+POST /pay/{order}/return — IGNORES PG-posted data for the payment
// decision; forces check(force:true), then redirects to the merchant
// redirect_url (allowlisted, with ?order_id&client_order_id&status) if paid,
// else back to the pay page.
//
// Round 7 (H2): the old route forced a provider verification on EVERY hit,
// so anyone who knew an order_no could burn provider quota (and flip an
// expired-but-paid-late order to paid) just by visiting the return URL.
// The forced check was then gated by a per-order durable rate limit
// (max 3 forced returns per order per 15 min) — EXCEPT when the request
// carried a plausible PG return signal (see hasPgReturnSignal, now
// deleted): the mere presence of a PG key name such as CHECKSUMHASH in
// the query or POST body skipped the budget entirely.
//
// Round 10 (Medium #2): that trust-by-presence bypass is REMOVED. The
// durable budget ALWAYS applies to every unauthenticated return. The
// only way past a spent budget is a POSTed Paytm return whose
// CHECKSUMHASH cryptographically verifies against the order's merchant
// key (verifyPaytmReturn below). PhonePe returns carry NO signature to
// verify (lib/verifiers/phonepe-pg.ts) and ALWAYS go through the budget,
// no exception. Any verification failure — missing key, missing account,
// non-Paytm provider, unparseable body, wrong checksum — falls back to
// the budget (fail closed, never fail open). The forced check itself
// still re-verifies server-side against the provider; the return never
// trusts PG-posted data to mark anything paid. The 120 s verification
// lease needs no change here: checkOrder's acquireLease enforces it
// (lease expiry + 3 s check-interval throttle) for every forced check.

/** Parse a POSTed return body into flat string params. Paytm posts
 * application/x-www-form-urlencoded; a JSON body is also accepted.
 * Returns null when the body is empty or unparseable (fail closed). */
function parseReturnParams(bodyText: string): Map<string, string> | null {
  const trimmed = bodyText.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("{")) {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      const out = new Map<string, string>();
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.set(k, String(v));
      }
      return out;
    }
    const params = new URLSearchParams(trimmed);
    const out = new Map<string, string>();
    for (const [k, v] of params.entries()) if (!out.has(k)) out.set(k, v);
    return out;
  } catch {
    return null;
  }
}

function lookupParam(params: Map<string, string>, name: string): string | undefined {
  for (const [k, v] of params) if (k.toLowerCase() === name.toLowerCase()) return v;
  return undefined;
}

/** Cryptographically verify a POSTed Paytm PG return against the order's
 * merchant key. Paytm's checksum (getChecksumFromArray construction)
 * covers the "|" -joined values of the POST params sorted by key,
 * EXCLUDING CHECKSUMHASH itself. Only paytm_pg / paytm_business accounts
 * may take this path — and paytm_business stores no merchant_key, so it
 * fails closed here in practice. When the gateway sent ORDERID / MID
 * they must match this order / account, so a genuine return for another
 * order cannot be replayed onto this one. */
async function verifyPaytmReturn(
  order: { payment_account_id: number | null; order_no: string },
  bodyText: string,
): Promise<boolean> {
  try {
    const params = parseReturnParams(bodyText);
    if (!params) return false;
    const checksum = lookupParam(params, "CHECKSUMHASH");
    if (!checksum) return false;
    const account = await loadAccount(order.payment_account_id);
    if (!account) return false;
    if (account.provider !== "paytm_pg" && account.provider !== "paytm_business") return false;
    const creds = decryptAccountCredentials(account);
    const key = creds.merchant_key;
    if (!key) return false;
    const orderId = lookupParam(params, "ORDERID");
    if (orderId !== undefined && orderId !== order.order_no) return false;
    const mid = lookupParam(params, "MID");
    if (mid !== undefined && creds.mid !== undefined && mid !== creds.mid) return false;
    const keys = [...params.keys()].filter((k) => k.toLowerCase() !== "checksumhash").sort();
    const payload = keys.map((k) => params.get(k) ?? "").join("|");
    return verifyPaytmChecksum(payload, key, checksum);
  } catch {
    return false;
  }
}

async function handle(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const order = await loadOrderByNo(orderNo);
  if (!order) return NextResponse.redirect(`${gatewayConfig.appUrl}/`);
  let after = order;
  let bodyText = "";
  if (req.method === "POST") {
    try { bodyText = await req.text(); } catch { bodyText = ""; }
  }
  // The durable budget is ALWAYS consulted — a forged ?CHECKSUMHASH= (or a
  // forged POST body) no longer forces a check once the budget is spent.
  // Only a POSTed Paytm return whose CHECKSUMHASH verifies against the
  // order's merchant key may force a check outside the budget (a genuine
  // gateway return must not be dropped just because the payer refreshed
  // the return page). GET returns never take the verified path: the
  // checksum covers POST params, so a query-string CHECKSUMHASH proves
  // nothing.
  const verifiedPaytmReturn = req.method === "POST" && bodyText !== ""
    ? await verifyPaytmReturn(order, bodyText)
    : false;
  const budget = await checkDurableRateLimit(`pay:return:order:${order.id}`, RETURN_FORCE_BUDGET, RETURN_FORCE_WINDOW_SECONDS);
  if (verifiedPaytmReturn || budget.allowed) {
    after = await checkOrder(order, true);
  }
  if (after.status === "paid" && after.redirect_url) {
    const sql = getSql();
    const user = first<Row>(await sql`SELECT redirect_domains FROM users WHERE id = ${after.user_id}`);
    const domains = (user?.redirect_domains as string[]) ?? [];
    let host = "";
    try { host = new URL(after.redirect_url).hostname.toLowerCase(); } catch { host = ""; }
    const allowed = domains.some((d) => { const dd = d.toLowerCase(); return host === dd || host.endsWith(`.${dd}`); });
    if (allowed) {
      const u = new URL(after.redirect_url);
      u.searchParams.set("order_id", after.order_no);
      u.searchParams.set("client_order_id", after.client_order_id);
      u.searchParams.set("status", after.status);
      return NextResponse.redirect(u.toString());
    }
  }
  return NextResponse.redirect(`${gatewayConfig.appUrl}/pay/${after.order_no}`);
}
export async function GET(req: Request, ctx: { params: Promise<{ orderNo: string }> }) { return handle(req, ctx); }
export async function POST(req: Request, ctx: { params: Promise<{ orderNo: string }> }) { return handle(req, ctx); }
