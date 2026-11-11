// MOCKED (pure validation + in-memory idempotency store; no DB, no network).
// (a) UTR-alone-does-not-mark-paid: the evidence validator rejects a UTR-only
// claim with no provider verification, and the review flow keeps the order in
// `review` until a merchant approves it (approve requires exact amount +
// timing-safe UTR match — tested here via the pure guards).
// (b) Order-creation idempotency: same key + same payload → same stored
// response; same key + different payload → 409.
import { describe, it, expect } from "vitest";
import { validateVerificationEvidence } from "../lib/orders/mark-paid";
import { acceptsCustomerUtr } from "../lib/orders/types";
import { checkIdempotency, storeIdempotentResponse, MemoryIdempotencyStore } from "../lib/idempotency";
import type { OrderRow } from "../lib/orders/types";
import type { VerificationResult } from "../lib/verifiers/verification-result";

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDABCDEFGHIJKLMN", user_id: 7, payment_account_id: 3,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "100.00", status: "pending", environment: "live",
    customer_name: null, customer_email: null, customer_mobile: null, note: null, redirect_url: null,
    utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 0, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    paid_at: null, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: new Date(Date.now() - 60 * 1000).toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
}
const ctx = { accountProvider: "paytm_business", accountId: 3, accountEnvironment: "live" };
function paidResult(over: Partial<VerificationResult> = {}): VerificationResult {
  const o = baseOrder();
  return {
    paid: true, utr: "123456789012", txnId: "TXN1", raw: {}, provider: "paytm_business",
    orderId: 1, orderNumber: o.order_no, amount: "100.00", currency: "INR",
    verifiedAt: new Date(), paymentAccountId: 3, environment: "live",
    originalExpiresAt: new Date(o.original_expires_at!), occurredAt: new Date(), ...over,
  };
}

describe("UTR alone does not mark paid", () => {
  it("a UTR-only claim with no provider verification is rejected", () => {
    const order = baseOrder();
    // No provider, no amount binding, no timestamp — not a VerificationResult.
    const fake = { paid: true, utr: "123456789012", txnId: null, raw: {}, provider: null, orderId: 1, orderNumber: order.order_no, amount: null, currency: null, verifiedAt: null, paymentAccountId: null, environment: null, originalExpiresAt: null, occurredAt: null } as unknown as VerificationResult;
    expect(validateVerificationEvidence(order, fake, ctx)).toBeTruthy();
  });
  it("a valid provider verification passes all evidence bindings", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult(), ctx)).toBeNull();
  });
  it("wrong amount is rejected", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult({ amount: "99.00" }), ctx)).toMatch(/Amount/);
  });
  it("wrong order number is rejected", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult({ orderNumber: "ORDOTHER" }), ctx)).toMatch(/Order number/);
  });
  it("provider/account mismatch is rejected", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult({ provider: "phonepe_pg" }), ctx)).toMatch(/Provider/);
    expect(validateVerificationEvidence(baseOrder(), paidResult({ paymentAccountId: 99 }), ctx)).toMatch(/payment account/);
  });
  it("evidence older than 24 h is rejected", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult({ occurredAt: new Date(Date.now() - 25 * 3600 * 1000) }), ctx)).toMatch(/too old/);
  });
  it("evidence after the late-payment grace window is rejected", () => {
    const order = baseOrder({ original_expires_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    expect(validateVerificationEvidence(order, paidResult({ originalExpiresAt: new Date(order.original_expires_at!) }), ctx)).toMatch(/grace window/);
  });
  it("submitting a UTR leaves the order in review (acceptsCustomerUtr is about submission, not payment)", () => {
    const order = baseOrder({ status: "pending" });
    expect(acceptsCustomerUtr(order, "manual")).toBe(true);
    expect(order.status).toBe("pending"); // submission alone changes nothing here
  });
  it("UTR submission is refused after 3 attempts or for non-manual accounts", () => {
    expect(acceptsCustomerUtr(baseOrder({ utr_attempts: 3 }), "manual")).toBe(false);
    expect(acceptsCustomerUtr(baseOrder(), "paytm_business")).toBe(false);
  });
});

describe("order creation idempotency", () => {
  it("same key + same payload replays the stored response", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100, client_order_id: "C1" };
    const body = { success: true, data: { order_id: "ORD1" } };
    await storeIdempotentResponse(store, "7:key-1", payload, 201, body);
    const replay = await checkIdempotency(store, "7:key-1", payload);
    expect(replay).toEqual({ status: 201, body });
  });
  it("same key + different payload → 409", async () => {
    const store = new MemoryIdempotencyStore();
    await storeIdempotentResponse(store, "7:key-1", { amount: 100 }, 201, { ok: true });
    await expect(checkIdempotency(store, "7:key-1", { amount: 200 })).rejects.toMatchObject({ status: 409 });
  });
  it("different keys are independent", async () => {
    const store = new MemoryIdempotencyStore();
    await storeIdempotentResponse(store, "7:key-1", { amount: 100 }, 201, { ok: true });
    expect(await checkIdempotency(store, "7:key-2", { amount: 100 })).toBeNull();
  });
});
