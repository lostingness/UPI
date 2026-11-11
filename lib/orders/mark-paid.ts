// markPaid — the security core (port of OrderService::markPaid).
// NEVER marks paid on frontend/UTR alone: only a server-side provider
// verification result (or admin override / UTR-review approval, which are
// separate code paths) can reach here.
//
// Pure evidence validation is exported as validateVerificationEvidence() so
// tests can prove the binding rules without a database:
//   provider ∈ {paytm_business, paytm_pg, phonepe_pg} and matches the account;
//   verification.paymentAccountId === account.id; env live on both sides;
//   orderId/orderNumber match; currency INR; verifiedAt present and not future;
//   UTR or txnId present; verified amount string-equals order amount (2dp);
//   originalExpiresAt timestamp-equals the order's originalExpiryDeadline();
//   occurredAt not future beyond clock-skew (300 s), not older than
//   evidence_max_age_seconds (86400 s / 24 h), not before created_at − skew,
//   not after originalExpiresAt + late_grace_hours (24) + skew;
//   status must be pending/expired (paid → idempotent no-op).
// The DB transition itself is a single conditional UPDATE (status guard in the
// WHERE clause) + an idempotent outbox INSERT (transition_key dedupe) — see
// lib/db.ts for why no multi-statement FOR UPDATE transaction is used.
import { gatewayConfig } from "../config/gateway";
import type { OrderRow } from "./types";
import { originalExpiryDeadline } from "./types";
import type { VerificationResult } from "../verifiers/verification-result";
import { recordOutboxEvent } from "../webhooks/outbox";
import { getSql } from "../db";
import { ApiError } from "../errors";

export interface EvidenceContext {
  accountProvider: string;
  accountId: number;
  accountEnvironment: string | null; // paymentEnvironment(): PGs → credential env, paytm_business/manual → 'live'
  existingUtrUsed?: (utr: string, userId: number) => Promise<boolean>;
}

export function validateVerificationEvidence(order: OrderRow, v: VerificationResult, ctx: EvidenceContext, now = new Date()): string | null {
  const providers = ["paytm_business", "paytm_pg", "phonepe_pg"];
  if (!v.provider || !providers.includes(v.provider)) return "Invalid provider";
  if (v.provider !== ctx.accountProvider) return "Provider does not match payment account";
  if (v.paymentAccountId !== ctx.accountId) return "Verification payment account mismatch";
  if (order.environment !== "live" || ctx.accountEnvironment !== "live") return "Environment mismatch";
  if (v.orderNumber !== order.order_no) return "Order number mismatch";
  if (v.orderId !== order.id) return "Order ID mismatch";
  if ((v.currency ?? "INR") !== "INR") return "Currency mismatch";
  if (!v.verifiedAt) return "Missing verification timestamp";
  if (v.verifiedAt.getTime() > now.getTime() + gatewayConfig.evidenceClockSkewSeconds * 1000) return "Verification timestamp is in the future";
  if (!((v.utr ?? "").trim()) && !((v.txnId ?? "").trim())) return "Missing transaction reference";
  if (v.amount === null || Number(v.amount).toFixed(2) !== Number(order.amount).toFixed(2)) return "Amount mismatch";
  const deadline = originalExpiryDeadline(order);
  if (!v.originalExpiresAt || v.originalExpiresAt.getTime() !== deadline.getTime()) return "Original expiry deadline mismatch";
  if (gatewayConfig.evidenceRequireTimestamp && !v.occurredAt) return "Missing provider transaction timestamp";
  if (v.occurredAt) {
    const skew = gatewayConfig.evidenceClockSkewSeconds * 1000;
    if (v.occurredAt.getTime() > now.getTime() + skew) return "Payment occurred in the future";
    if (now.getTime() - v.occurredAt.getTime() > gatewayConfig.evidenceMaxAgeSeconds * 1000) return "Payment evidence is too old";
    if (v.occurredAt.getTime() < new Date(order.created_at).getTime() - skew) return "Payment occurred before order creation";
    if (v.occurredAt.getTime() > deadline.getTime() + gatewayConfig.latePaymentGraceHours * 3600 * 1000 + skew) return "Payment occurred after the late-payment grace window";
  }
  return null;
}

/** DB transition: conditional UPDATE (only pending/expired → paid) + outbox insert.
 * Returns "paid" | "already-paid" (idempotent no-op) | throws ApiError on conflict. */
export async function markPaidInDb(order: OrderRow, v: VerificationResult, ctx: EvidenceContext): Promise<"paid" | "already-paid"> {
  if (order.status === "paid") return "already-paid";
  const err = validateVerificationEvidence(order, v, ctx);
  if (err) throw new ApiError(422, err);
  const utr = (v.utr ?? "").trim().toUpperCase() || null;
  if (utr) {
    const clash = await ctx.existingUtrUsed?.(utr, order.user_id);
    if (clash) throw new ApiError(422, "This UTR is already used for another order.");
  }
  const sql = getSql();
  const paidAt = (v.occurredAt ?? new Date()).toISOString();
  const updated = await sql`
    UPDATE orders SET status = 'paid', utr = ${utr}, provider_txn_id = ${v.txnId ?? null},
      provider_response = ${JSON.stringify(v.raw)}::jsonb, verified_by = 'provider',
      paid_at = ${paidAt}, review_note = NULL,
      verification_token = NULL, verification_generation = 0, verification_expires_at = NULL,
      verification_started_at = NULL, verification_node_id = NULL,
      verification_node_instance_id = NULL, verification_process_identity = NULL,
      updated_at = NOW()
    WHERE id = ${order.id} AND status IN ('pending', 'expired') RETURNING id`;
  if ((updated as unknown[]).length === 0) {
    // Lost a race: re-read — paid means idempotent no-op, anything else is a conflict.
    const cur = await sql`SELECT status FROM orders WHERE id = ${order.id}`;
    if ((cur as { status: string }[])[0]?.status === "paid") return "already-paid";
    throw new ApiError(409, "Order status changed while verifying payment");
  }
  const paidOrder: OrderRow = { ...order, status: "paid", utr, provider_txn_id: v.txnId ?? null, verified_by: "provider", paid_at: paidAt };
  await recordOutboxEvent(sql, paidOrder, "order.paid");
  return "paid";
}
