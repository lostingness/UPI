// PaytmBusinessVerifier — port of PaytmBusinessVerifier.php.
// Unofficial endpoint GET {PAYTM_STATUS_URL}?JsonData={MID, ORDERID}.
// Paid only when ALL of: STATUS==='TXN_SUCCESS', ORDERID matches, TXNAMOUNT
// paise == order amount, currency INR, BANKTXNID or TXNID present, timestamp
// present when evidence_require_timestamp. Every failure is pending, never a
// throw. Credentials (MID) are never logged. Feature-flagged by
// GATEWAY_ENABLE_PAYTM_BUSINESS (default true).
import { gatewayConfig } from "../config/gateway";
import { VerificationResult, amountMatches, extractRawTimestamp, type OrderLike, type VerificationResult as VR } from "./verification-result";

export interface AccountLike { id: number; credentials: Record<string, string>; environment: string | null; }
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function checkPaytmBusiness(order: OrderLike, account: AccountLike | null, fetchFn: FetchFn = fetch): Promise<VR> {
  if (!account) return VerificationResult.pending({ error: "A matching payment account is required.", code: "missing_account" });
  if (!gatewayConfig.enablePaytmBusiness) {
    return VerificationResult.pending({ error: "Paytm Business verification is disabled by platform policy", code: "disabled" });
  }
  const mid = account.credentials.mid;
  if (!mid) return VerificationResult.pending({ error: "Paytm MID not configured", code: "missing_mid" });
  let data: Record<string, unknown> = {};
  try {
    const url = `${gatewayConfig.paytmStatusUrl}?JsonData=${encodeURIComponent(JSON.stringify({ MID: mid, ORDERID: order.order_no }))}`;
    const res = await fetchFn(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    data = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    const msg = String((e as Error)?.message ?? "").toLowerCase();
    const code = msg.includes("timed out") || msg.includes("timeout") ? "timeout"
      : msg.includes("refused") || msg.includes("resolve") || msg.includes("econnrefused") || msg.includes("enotfound") ? "connection_failed" : "verification_error";
    return VerificationResult.pending({ error: "Paytm status check failed.", code });
  }
  if (data.STATUS !== "TXN_SUCCESS") return VerificationResult.pending(sanitize(data));
  if (data.ORDERID !== order.order_no) return VerificationResult.pending({ error: "Order ID mismatch", code: "order_id_mismatch" });
  const amt = data.TXNAMOUNT;
  if (typeof amt !== "string" && typeof amt !== "number" || !/^\d+(?:\.\d{1,2})?$/.test(String(amt)) || !amountMatches(amt, order.amount)) {
    return VerificationResult.pending({ error: "Amount mismatch", code: "amount_mismatch" });
  }
  if ((data.CURRENCY ?? "INR") !== "INR") return VerificationResult.pending({ error: "Currency mismatch", code: "currency_mismatch" });
  if (!String(data.BANKTXNID ?? "").trim() && !String(data.TXNID ?? "").trim()) {
    return VerificationResult.pending({ error: "Missing transaction reference", code: "missing_reference" });
  }
  const occurredAt = extractRawTimestamp("paytm_business", data);
  if (!occurredAt && gatewayConfig.evidenceRequireTimestamp) {
    return VerificationResult.pending({ error: "Missing or invalid provider transaction timestamp", code: "invalid_timestamp" });
  }
  return VerificationResult.fromPaytmBusiness(order, amt as string, (data.BANKTXNID as string) ?? null, (data.TXNID as string) ?? null, sanitize(data), (data.CURRENCY as string) ?? "INR", occurredAt, account.id, account.environment);
}
function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const { MID, mid, ...rest } = data; void MID; void mid; return rest;
}
