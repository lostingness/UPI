// Port of app/Services/Verifiers/VerificationResult.php.
// Provider-bound success factories only — no generic success factory, by design.
// A paid result REQUIRES a UTR or txnId. `pending()` is returned for every
// not-paid-yet outcome; verifiers must never throw for "not paid yet".
export type Provider = "paytm_business" | "paytm_pg" | "phonepe_pg";

export interface VerificationResult {
  paid: boolean;
  utr: string | null;
  txnId: string | null;
  raw: Record<string, unknown>;
  provider: Provider | null;
  orderId: number | null;
  orderNumber: string | null;
  amount: string | null; // 2dp string
  currency: string | null;
  verifiedAt: Date | null;
  paymentAccountId: number | null;
  environment: string | null;
  originalExpiresAt: Date | null;
  occurredAt: Date | null;
  code?: string;
}

export interface OrderLike {
  id: number; order_no: string; amount: string | number;
  payment_account_id: number | null;
  original_expires_at: string | Date | null; expires_at: string | Date | null;
  created_at: string | Date;
}

export function originalExpiryDeadline(order: OrderLike): Date {
  const v = order.original_expires_at ?? order.expires_at;
  return v ? new Date(v) : new Date(Date.now() + 15 * 60 * 1000);
}

/** Timestamp parsing (port of parseProviderTimestamp): >=12-digit numeric → ms
 * epoch; 10-digit → seconds epoch; trailing Z/offset → parse as UTC; else
 * 'Y-m-d H:i:s' in provider timezone (Asia/Kolkata) → UTC; strip fractions. */
export function parseProviderTimestamp(value: string | number | null | undefined, timezone = "Asia/Kolkata"): Date | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed) && trimmed.length >= 12) return new Date(Number(trimmed));
  if (/^\d+$/.test(trimmed) && trimmed.length === 10) return new Date(Number(trimmed) * 1000);
  try {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return new Date(trimmed);
    const cleaned = trimmed.replace(/\.\d+$/, "").replace("T", " ");
    // 'Y-m-d H:i:s' interpreted in provider tz (Asia/Kolkata = UTC+5:30, no DST).
    const m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      const offsetMs = timezone === "Asia/Kolkata" ? 5.5 * 3600 * 1000 : 0;
      return new Date(utcMs - offsetMs);
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export function extractRawTimestamp(provider: Provider, raw: Record<string, unknown>): Date | null {
  let value: unknown;
  if (provider === "paytm_business") value = raw.TXNDATE ?? raw.TXNDATETIME ?? raw.txnDate;
  else if (provider === "paytm_pg") value = raw.txnDate ?? raw.TXNDATE ?? (raw.body as Record<string, unknown> | undefined)?.txnDate;
  else {
    const details = Array.isArray(raw.paymentDetails) ? raw.paymentDetails : [];
    const completed = details.find((d) => (d as Record<string, unknown>).state === "COMPLETED") as Record<string, unknown> | undefined;
    value = completed?.completedAt ?? completed?.timestamp ?? raw.completedAt ?? raw.timestamp;
  }
  return parseProviderTimestamp(value as string | number | null);
}

function successful(order: OrderLike, provider: Provider, amount: string | number, utr: string | null, txnId: string | null,
  raw: Record<string, unknown>, currency = "INR", occurredAt?: Date | null, paymentAccountId?: number | null, environment?: string | null): VerificationResult {
  if (!((utr ?? "").trim()) && !((txnId ?? "").trim())) {
    throw new Error("Provider verification requires a transaction reference.");
  }
  const occurred = occurredAt ?? (Object.keys(raw).length ? extractRawTimestamp(provider, raw) : null) ?? new Date();
  return {
    paid: true, utr: utr ?? null, txnId: txnId ?? null, raw, provider,
    orderId: order.id, orderNumber: order.order_no,
    amount: Number(amount).toFixed(2), currency,
    verifiedAt: new Date(), paymentAccountId: paymentAccountId ?? order.payment_account_id ?? null,
    environment: environment ?? null,
    originalExpiresAt: originalExpiryDeadline(order), occurredAt: occurred,
  };
}

export const VerificationResult = {
  fromPaytmBusiness: (o: OrderLike, a: string | number, u: string | null, t: string | null, raw: Record<string, unknown> = {}, c = "INR", occ?: Date | null, acc?: number | null, env?: string | null) =>
    successful(o, "paytm_business", a, u, t, raw, c, occ, acc, env),
  fromPaytmPg: (o: OrderLike, a: string | number, u: string | null, t: string | null, raw: Record<string, unknown> = {}, c = "INR", occ?: Date | null, acc?: number | null, env?: string | null) =>
    successful(o, "paytm_pg", a, u, t, raw, c, occ, acc, env),
  fromPhonePePg: (o: OrderLike, a: string | number, u: string | null, t: string | null, raw: Record<string, unknown> = {}, c = "INR", occ?: Date | null, acc?: number | null, env?: string | null) =>
    successful(o, "phonepe_pg", a, u, t, raw, c, occ, acc, env),
  pending: (raw: Record<string, unknown> = {}): VerificationResult => ({
    paid: false, utr: null, txnId: null, raw, provider: null, orderId: null, orderNumber: null,
    amount: null, currency: null, verifiedAt: null, paymentAccountId: null, environment: null,
    originalExpiresAt: null, occurredAt: null, code: typeof raw.code === "string" ? raw.code : undefined,
  }),
};

export function toPaise(amount: string | number): number { return Math.round(Number(amount) * 100); }
export function amountMatches(a: string | number, b: string | number): boolean { return toPaise(a) === toPaise(b); }
