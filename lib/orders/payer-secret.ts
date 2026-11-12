// Payer secret — Round 10 (M1: pay-token:unauthenticated-mint:order-no-only).
//
// PROBLEM: getPayData() minted payer-binding pay tokens for ANY anonymous
// visitor who knew only an order_no, so the Round 7 payer binding did not
// stop UTR griefing, forced provider checks, or hosted-checkout starts —
// the order_no is printed on the QR, the pay page and the merchant's screen.
//
// DESIGN: at order creation a random 32-hex payer secret is minted and
// stored on the order row (migration 017; lazily ensured here, same pattern
// as migration 013 / lib/pay-token.ts ensureCheckoutStartsColumn, so a
// deployed instance self-heals if `npm run migrate` has not been run yet).
// Merchant-facing serializations embed it in the payment URL as
// `/pay/<order_no>?k=<secret>` (lib/orders/serialize.ts, includePayerSecret);
// getPayData() mints pay tokens ONLY when the render presents that secret.
// The QR code itself encodes a UPI intent URI (upi://pay?pa=...&am=...&tr=
// <order_no>), NOT the pay-page URL, so the ?k= secret is never leaked by
// the QR. The secret is NEVER sent to the pay page's `api` prop (an
// attacker loading the page could extract it from the RSC payload) and is
// never passed into any client prop — the pay page reads `k` server-side
// only and forwards it to getPayData().
//
// The secret is a bearer for the pay page only: it proves the caller holds
// the merchant-issued payment link. It is NOT a payment authorisation —
// a UTR submit still only moves the order to `review`; marking paid still
// needs provider verification / merchant approval.
import crypto from "node:crypto";
import type { Sql } from "../db";
import { timingSafeEqual } from "../crypto";

/** 32 lowercase hex chars (16 random bytes). */
export function newPayerSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

const PAYER_SECRET_RE = /^[0-9a-f]{32}$/;

/** True only when both sides are non-empty 32-hex strings and equal
 * (constant-time comparison — the presented value is attacker-controlled). */
export function isValidPayerSecret(
  presented: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (typeof presented !== "string" || typeof stored !== "string") return false;
  if (!PAYER_SECRET_RE.test(presented) || !PAYER_SECRET_RE.test(stored)) return false;
  return timingSafeEqual(presented, stored);
}

// --- Lazy column ensure (migration 017 is canonical) -----------------------
let payerSecretColumnEnsured = false;
/** Test seam: reset the once-per-process lazy-creation flag. */
export function __resetPayerSecretColumnEnsuredForTests(): void {
  payerSecretColumnEnsured = false;
}

/** Best-effort ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Returns true when
 * the column is (now) available, false when the ensure failed — callers
 * must treat false as "secret unavailable" and keep working without it
 * (order creation must never fail because this column is missing). */
export async function ensurePayerSecretColumn(sql: Sql): Promise<boolean> {
  if (payerSecretColumnEnsured) return true;
  try {
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payer_secret TEXT`;
    // Only latch the flag on success: a failed ensure (DB down) must be
    // retried by the next call instead of reported as available.
    payerSecretColumnEnsured = true;
    return true;
  } catch {
    return false;
  }
}
