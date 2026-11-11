// MOCKED (injected fetch, no DB, no real network).
// Paytm Business + Paytm PG + PhonePe PG: paid only on all bindings; every
// failure mode is pending, never a throw. UPI intent: manual accounts omit `tr`.
import { describe, it, expect } from "vitest";
import { checkPaytmBusiness } from "../lib/verifiers/paytm-business";
import { checkPaytmPg } from "../lib/verifiers/paytm-pg";
import { checkPhonePePg } from "../lib/verifiers/phonepe-pg";
import { upiIntentUrl } from "../lib/orders/intent";
import type { OrderLike } from "../lib/verifiers/verification-result";

const order: OrderLike = {
  id: 1, order_no: "ORDABCDEFGHIJKLMN", amount: "100.00", payment_account_id: 3,
  original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  created_at: new Date(Date.now() - 60 * 1000).toISOString(),
};
const account = { id: 3, credentials: { mid: "MID123", merchant_key: "1234567890123456", environment: "sandbox", client_id: "CID", client_secret: "CSEC", client_version: "1" }, environment: "live" };
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Paytm Business verifier", () => {
  it("paid on TXN_SUCCESS + exact amount + reference + timestamp", async () => {
    const r = await checkPaytmBusiness(order, account, async () => jsonRes({
      STATUS: "TXN_SUCCESS", ORDERID: order.order_no, TXNAMOUNT: "100.00", CURRENCY: "INR",
      BANKTXNID: "123456789012", TXNID: "T1", TXNDATE: "2026-11-11 12:00:00",
    }));
    expect(r.paid).toBe(true); expect(r.utr).toBe("123456789012");
  });
  it("pending on amount mismatch", async () => {
    const r = await checkPaytmBusiness(order, account, async () => jsonRes({
      STATUS: "TXN_SUCCESS", ORDERID: order.order_no, TXNAMOUNT: "99.00", CURRENCY: "INR", BANKTXNID: "1", TXNDATE: "2026-11-11 12:00:00",
    }));
    expect(r.paid).toBe(false); expect(r.code).toBe("amount_mismatch");
  });
  it("pending (not throw) on transport error", async () => {
    const r = await checkPaytmBusiness(order, account, async () => { throw new Error("fetch failed"); });
    expect(r.paid).toBe(false);
  });
  it("pending when MID missing", async () => {
    const r = await checkPaytmBusiness(order, { ...account, credentials: {} }, async () => jsonRes({}));
    expect(r.paid).toBe(false); expect(r.code).toBe("missing_mid");
  });
});

describe("Paytm PG verifier", () => {
  it("pending on non-TXN_SUCCESS", async () => {
    const r = await checkPaytmPg(order, account, async () => jsonRes({ body: { resultInfo: { resultStatus: "TXN_FAILURE" } } }));
    expect(r.paid).toBe(false);
  });
});

describe("PhonePe PG verifier", () => {
  it("pending on non-COMPLETED state", async () => {
    const r = await checkPhonePePg(order, account, async (url) => {
      if (String(url).includes("oauth/token")) return jsonRes({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 });
      return jsonRes({ state: "PENDING", merchantOrderId: order.order_no, amount: 10000 });
    });
    expect(r.paid).toBe(false);
  });
  it("paid on COMPLETED + exact paise + UTR", async () => {
    const r = await checkPhonePePg(order, account, async (url) => {
      if (String(url).includes("oauth/token")) return jsonRes({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 });
      return jsonRes({
        state: "COMPLETED", merchantOrderId: order.order_no, amount: 10000, currency: "INR",
        paymentDetails: [{ state: "COMPLETED", rail: { utr: "123456789012" }, transactionId: "PP1", completedAt: new Date().toISOString() }],
      });
    });
    expect(r.paid).toBe(true); expect(r.utr).toBe("123456789012");
  });
});

describe("UPI intent", () => {
  it("manual accounts omit tr; non-manual include tr", () => {
    const manual = upiIntentUrl({ order_no: "ORD1", amount: "50.00", note: null }, { provider: "manual", upi_id: "shop@okaxis", payee_name: "Shop" });
    expect(manual).not.toContain("tr=");
    expect(manual).toContain("pa=shop%40okaxis");
    const pb = upiIntentUrl({ order_no: "ORD1", amount: "50.00", note: null }, { provider: "paytm_business", upi_id: "shop@paytm", payee_name: "Shop" });
    expect(pb).toContain("tr=ORD1");
  });
});
