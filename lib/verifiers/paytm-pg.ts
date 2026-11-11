// PaytmPgVerifier — port of PaytmPgVerifier.php (official Paytm PG).
// startCheckout: signed POST {base}/theia/api/v1/initiateTransaction → txnToken
//   → {type:'form', url: showPaymentPage, fields:{mid,orderId,txnToken}, expires_at: now+14min}
// check: signed POST {base}/v3/order/status → body.resultInfo.resultStatus
//   === 'TXN_SUCCESS' + orderId/amount/currency/reference/timestamp bindings.
// Signed envelope: bodyJson = JSON.stringify(body) (slashes unescaped — Node
// JSON.stringify matches); signature = PaytmChecksum.generate(bodyJson, key);
// POST body is the literal string {"body":<bodyJson>,"head":{"signature":<sig>}}.
// HTTP timeout 15 s. Provider errors → pending, never a throw for not-paid.
import { gatewayConfig } from "../config/gateway";
import { generatePaytmChecksum } from "./paytm-checksum";
import { VerificationResult, amountMatches, extractRawTimestamp, type OrderLike, type VerificationResult as VR } from "./verification-result";
import type { AccountLike, FetchFn } from "./paytm-business";
import type { HostedCheckoutResult } from "./hosted-checkout";

export function paytmPgBaseUrl(account: AccountLike): string {
  const env = account.credentials.environment === "production" ? "production" : "sandbox";
  const base = env === "production" ? gatewayConfig.paytmPgProductionUrl : gatewayConfig.paytmPgSandboxUrl;
  return base.replace(/\/+$/, "");
}

export async function signedPaytmPost(account: AccountLike, url: string, body: Record<string, unknown>, fetchFn: FetchFn = fetch): Promise<Record<string, unknown>> {
  const key = account.credentials.merchant_key;
  if (!key) throw new Error("Paytm merchant key not configured");
  const bodyJson = JSON.stringify(body);
  const signature = generatePaytmChecksum(bodyJson, key);
  const payload = `{"body":${bodyJson},"head":{"signature":${JSON.stringify(signature)}}}`;
  const res = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: payload, signal: AbortSignal.timeout(15000) });
  return (await res.json()) as Record<string, unknown>;
}

export async function startPaytmPgCheckout(order: OrderLike, account: AccountLike, returnUrl: string, fetchFn: FetchFn = fetch): Promise<HostedCheckoutResult> {
  const mid = account.credentials.mid;
  if (!mid) throw new Error("Paytm MID not configured");
  const base = paytmPgBaseUrl(account);
  const resp = await signedPaytmPost(account, `${base}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(order.order_no)}`, {
    requestType: "Payment", mid,
    websiteName: account.credentials.website_name || "DEFAULT",
    orderId: order.order_no, callbackUrl: returnUrl,
    txnAmount: { value: Number(order.amount).toFixed(2), currency: "INR" },
    userInfo: { custId: `CUST${(order as unknown as { user_id: number }).user_id}X${order.id}` },
  }, fetchFn);
  const body = (resp.body ?? {}) as Record<string, unknown>;
  const token = (body.txnToken as string) ?? null;
  if ((body.resultInfo as Record<string, unknown> | undefined)?.resultStatus !== "S" || !token) {
    throw new Error("Paytm could not start the payment. Please try again.");
  }
  return {
    type: "form",
    url: `${base}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(order.order_no)}`,
    fields: { mid, orderId: order.order_no, txnToken: token },
    expires_at: Math.floor(Date.now() / 1000) + 14 * 60,
  };
}

export async function checkPaytmPg(order: OrderLike, account: AccountLike | null, fetchFn: FetchFn = fetch): Promise<VR> {
  if (!account) return VerificationResult.pending({ error: "A matching payment account is required.", code: "missing_account" });
  let resp: Record<string, unknown>;
  try {
    resp = await signedPaytmPost(account, `${paytmPgBaseUrl(account)}/v3/order/status`, { mid: account.credentials.mid, orderId: order.order_no }, fetchFn);
  } catch (e) {
    return VerificationResult.pending({ error: (e as Error).message });
  }
  const body = (resp.body ?? {}) as Record<string, unknown>;
  if ((body.resultInfo as Record<string, unknown> | undefined)?.resultStatus !== "TXN_SUCCESS") return VerificationResult.pending(body);
  if (body.orderId !== order.order_no) return VerificationResult.pending({ error: "Order ID mismatch" });
  const amt = body.txnAmount;
  if ((typeof amt !== "string" && typeof amt !== "number") || !/^\d+(?:\.\d{1,2})?$/.test(String(amt)) || !amountMatches(amt, order.amount)) {
    return VerificationResult.pending({ error: "Amount mismatch" });
  }
  if ((body.currency ?? "INR") !== "INR") return VerificationResult.pending({ error: "Currency mismatch" });
  if (!String(body.bankTxnId ?? "").trim() && !String(body.txnId ?? "").trim()) {
    return VerificationResult.pending({ error: "Missing transaction reference" });
  }
  const occurredAt = extractRawTimestamp("paytm_pg", body);
  if (!occurredAt && gatewayConfig.evidenceRequireTimestamp) {
    return VerificationResult.pending({ error: "Missing or invalid provider transaction timestamp" });
  }
  return VerificationResult.fromPaytmPg(order, amt as string, (body.bankTxnId as string) ?? null, (body.txnId as string) ?? null, body, (body.currency as string) ?? "INR", occurredAt, account.id, account.environment);
}
