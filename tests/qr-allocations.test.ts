// MOCKED (in-memory fake Neon sql client; no DB, no network).
// Two QR methods: unique-amount allocation (distinct paise steps, no
// duplicate while active, release on expiry, increment config, rounding,
// exhaustion → 409) and same-amount (no allocation row). Verification —
// provider evidence, UTR review and the verifiers — must match the PAYABLE
// amount, not the order amount. Intent + API shape carry payable_amount.
import { describe, it, expect, beforeEach } from "vitest";
import {
  allocatePayableAmount, releaseAllocation, releaseExpiredAllocations,
  getMerchantQrSettings, getQrAllocationCounts, listAllocations,
  toPaiseStrict, paiseToAmount, __resetAllocationTableEnsuredForTests,
} from "../lib/orders/allocations";
import { validateVerificationEvidence } from "../lib/orders/mark-paid";
import { upiIntentUrl } from "../lib/orders/intent";
import { toApiArray } from "../lib/orders/serialize";
import { checkPaytmBusiness } from "../lib/verifiers/paytm-business";
import type { OrderRow } from "../lib/orders/types";
import type { VerificationResult } from "../lib/verifiers/verification-result";

interface FakeAlloc {
  id: number; user_id: number; payment_account_id: number | null;
  order_id: number; order_no: string; base_amount: string; payable_amount: string;
  status: string; allocated_at: string; released_at: string | null; expires_at: string;
}

/** Fake Neon sql client: dispatches on the SQL text, keeps allocations +
 * user QR settings in memory. Mirrors the real guards (active-only
 * uniqueness per user+account+amount). */
class FakeDb {
  allocations: FakeAlloc[] = [];
  users = new Map<number, { qr_method: string; qr_increment_paise: number }>();
  nextId = 1;
  /** Throw a unique-violation on the next allocation insert, once. */
  failNextInsertUnique = false;

  sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").trimStart();
    if (text.startsWith("CREATE TABLE") || text.startsWith("CREATE UNIQUE INDEX") || text.startsWith("CREATE INDEX")) return [];
    if (text.startsWith("INSERT INTO upi_amount_allocations")) {
      if (this.failNextInsertUnique) {
        this.failNextInsertUnique = false;
        throw new Error('duplicate key value violates unique constraint "upi_amount_allocations_user_active_unique"');
      }
      const [userId, paymentAccountId, orderId, orderNo, base, payable, expiresAt] =
        values as [number, number | null, number, string, string, string, string];
      const clash = this.allocations.some((a) =>
        a.status === "active" && a.user_id === userId &&
        (a.payment_account_id ?? -1) === (paymentAccountId ?? -1) && a.payable_amount === payable);
      if (clash) return [];
      const row: FakeAlloc = {
        id: this.nextId++, user_id: userId, payment_account_id: paymentAccountId,
        order_id: orderId, order_no: orderNo, base_amount: base, payable_amount: payable,
        status: "active", allocated_at: new Date().toISOString(), released_at: null, expires_at: expiresAt,
      };
      this.allocations.push(row);
      return [row];
    }
    if (text.startsWith("UPDATE upi_amount_allocations SET status = 'released'")) {
      if (text.includes("WHERE order_id =")) {
        const orderId = values[0] as number;
        const hit = this.allocations.filter((a) => a.order_id === orderId && a.status === "active");
        hit.forEach((a) => { a.status = "released"; a.released_at = new Date().toISOString(); });
        return hit.map((a) => ({ id: a.id }));
      }
      if (text.includes("expires_at < NOW()")) {
        const now = Date.now();
        const hit = this.allocations.filter((a) => a.status === "active" && new Date(a.expires_at).getTime() < now);
        hit.forEach((a) => { a.status = "released"; a.released_at = new Date().toISOString(); });
        return hit.map((a) => ({ id: a.id }));
      }
    }
    if (text.startsWith("SELECT qr_method, qr_increment_paise FROM users")) {
      const row = this.users.get(values[0] as number);
      return row ? [row] : [];
    }
    if (text.includes("COUNT(*) FILTER")) {
      const userId = values[0] as number;
      const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
      const istDayStart = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - 5.5 * 3600 * 1000;
      const mine = this.allocations.filter((a) => a.user_id === userId);
      return [{
        active: mine.filter((a) => a.status === "active").length,
        released_today: mine.filter((a) => a.status === "released" && a.released_at && new Date(a.released_at).getTime() >= istDayStart).length,
        expired_today: mine.filter((a) => a.status === "released" && new Date(a.expires_at).getTime() < Date.now() && a.released_at && new Date(a.released_at).getTime() >= istDayStart).length,
      }];
    }
    if (text.includes("ORDER BY allocated_at DESC")) {
      const [userId, status, , perPage, offset] = values as [number, string, string, number, number];
      const mine = this.allocations
        .filter((a) => a.user_id === userId && (status === "" || a.status === status))
        .sort((a, b) => b.allocated_at.localeCompare(a.allocated_at));
      return mine.slice(offset, offset + perPage);
    }
    if (text.includes("SELECT COUNT(*) AS n FROM upi_amount_allocations")) {
      const [userId, status] = values as [number, string];
      return [{ n: this.allocations.filter((a) => a.user_id === userId && (status === "" || a.status === status)).length }];
    }
    throw new Error(`unexpected SQL in fake: ${text.slice(0, 100)}`);
  }) as never;

  seedActive(userId: number, orderId: number, orderNo: string, payable: string, base = "500.00", expiresAt?: string): FakeAlloc {
    const row: FakeAlloc = {
      id: this.nextId++, user_id: userId, payment_account_id: 3, order_id: orderId,
      order_no: orderNo, base_amount: base, payable_amount: payable, status: "active",
      allocated_at: new Date().toISOString(), released_at: null,
      expires_at: expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    this.allocations.push(row);
    return row;
  }
}

let db: FakeDb;
beforeEach(() => { db = new FakeDb(); __resetAllocationTableEnsuredForTests(); });

const EXP = new Date(Date.now() + 15 * 60 * 1000).toISOString();
const alloc = (orderId: number, over: Record<string, unknown> = {}) => allocatePayableAmount(db.sql, {
  userId: 7, paymentAccountId: 3, orderId, orderNo: `ORD${orderId}`, baseAmount: 500,
  method: "unique", incrementPaise: 1, expiresAt: EXP, ...over,
});

describe("unique-amount allocation", () => {
  it("same base amount, 3 sequential allocations → .01, .02, .03, distinct", async () => {
    const a = await alloc(1);
    const b = await alloc(2);
    const c = await alloc(3);
    expect([a.payableAmount, b.payableAmount, c.payableAmount]).toEqual(["500.01", "500.02", "500.03"]);
    expect(new Set(db.allocations.map((x) => x.payable_amount)).size).toBe(3);
  });
  it("an active allocation for 500.01 is never re-issued while active", async () => {
    db.seedActive(7, 1, "ORD1", "500.01");
    const next = await alloc(2);
    expect(next.payableAmount).toBe("500.02");
    expect(db.allocations.filter((a) => a.payable_amount === "500.01" && a.status === "active")).toHaveLength(1);
  });
  it("a unique-violation race is retried with the next candidate", async () => {
    db.failNextInsertUnique = true;
    const a = await alloc(1);
    expect(a.payableAmount).toBe("500.02");
    expect(db.allocations).toHaveLength(1);
  });
  it("release on expiry → the same payable amount can be allocated again", async () => {
    const a = await alloc(1);
    expect(a.payableAmount).toBe("500.01");
    expect(await releaseAllocation(db.sql, 1, "expired")).toBe(true);
    expect(await releaseAllocation(db.sql, 1, "expired")).toBe(false);
    const b = await alloc(2);
    expect(b.payableAmount).toBe("500.01");
  });
  it("releaseExpiredAllocations frees past-expiry allocations for reuse", async () => {
    db.seedActive(7, 1, "ORD1", "500.01", "500.00", new Date(Date.now() - 1000).toISOString());
    expect(await releaseExpiredAllocations(db.sql)).toBe(1);
    const b = await alloc(2);
    expect(b.payableAmount).toBe("500.01");
  });
  it("increment config is respected (5 paise → .05, .10)", async () => {
    const a = await alloc(1, { incrementPaise: 5 });
    const b = await alloc(2, { incrementPaise: 5 });
    expect([a.payableAmount, b.payableAmount]).toEqual(["500.05", "500.10"]);
  });
  it("exhaustion → 409 and no duplicate is issued", async () => {
    db.seedActive(7, 1, "ORD1", "500.01");
    db.seedActive(7, 2, "ORD2", "500.02");
    await expect(alloc(3, { maxAttempts: 2 })).rejects.toMatchObject({ status: 409 });
    expect(db.allocations).toHaveLength(2);
  });
  it("candidates never cross base + Rs 1.00 (60 paise steps stop at .60)", async () => {
    db.seedActive(7, 1, "ORD1", "500.60");
    await expect(alloc(2, { incrementPaise: 60, maxAttempts: 100 })).rejects.toMatchObject({ status: 409 });
    expect(db.allocations).toHaveLength(1);
  });
});

describe("paise math and rounding", () => {
  it("500.005 is rejected, never silently rounded", () => {
    expect(() => toPaiseStrict(500.005)).toThrow(/2 decimal places/);
  });
  it("paise math is exact (no float drift)", () => {
    expect(toPaiseStrict(0.1 + 0.2)).toBe(30);
    expect(toPaiseStrict("500.01")).toBe(50001);
    expect(paiseToAmount(50001)).toBe("500.01");
  });
  it("allocate rejects a non-2dp base amount with 422", async () => {
    await expect(alloc(1, { baseAmount: 500.005 })).rejects.toMatchObject({ status: 422 });
  });
});

describe("same-amount mode", () => {
  it("payable == amount and no allocation row is created", async () => {
    const r = await allocatePayableAmount(db.sql, {
      userId: 7, paymentAccountId: 3, orderId: 1, orderNo: "ORD1",
      baseAmount: 500, method: "same", expiresAt: EXP,
    });
    expect(r.payableAmount).toBe("500.00");
    expect(r.allocation).toBeNull();
    expect(db.allocations).toHaveLength(0);
  });
});

describe("merchant QR settings", () => {
  it("stored settings are returned; unknown merchant falls back to env defaults", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 5 });
    expect(await getMerchantQrSettings(db.sql, 7)).toEqual({ method: "unique", incrementPaise: 5 });
    expect(await getMerchantQrSettings(db.sql, 99)).toEqual({ method: "same", incrementPaise: 1 });
  });
  it("counts and list are merchant-scoped", async () => {
    db.seedActive(7, 1, "ORD1", "500.01");
    db.seedActive(7, 2, "ORD2", "500.02");
    db.seedActive(8, 3, "ORD3", "500.01");
    await releaseAllocation(db.sql, 1, "expired");
    const counts = await getQrAllocationCounts(db.sql, 7);
    expect(counts.active).toBe(1);
    expect(counts.releasedToday).toBe(1);
    const list = await listAllocations(db.sql, 7, { status: "", page: 1 });
    expect(list.total).toBe(2);
    expect(list.allocations.map((a) => a.order_no).sort()).toEqual(["ORD1", "ORD2"]);
    const released = await listAllocations(db.sql, 7, { status: "released", page: 1 });
    expect(released.total).toBe(1);
  });
});

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDABCDEFGHIJKLMN", user_id: 7, payment_account_id: 3,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "500.00", payable_amount: "500.01",
    status: "pending", environment: "live",
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
    orderId: 1, orderNumber: o.order_no, amount: "500.01", currency: "INR",
    verifiedAt: new Date(), paymentAccountId: 3, environment: "live",
    originalExpiresAt: new Date(o.original_expires_at!), occurredAt: new Date(), ...over,
  };
}

describe("verification uses payable_amount", () => {
  it("provider amount == order amount but != payable_amount → NOT paid", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult({ amount: "500.00" }), ctx)).toMatch(/Amount/);
  });
  it("provider amount == payable_amount → paid (all other bindings intact)", () => {
    expect(validateVerificationEvidence(baseOrder(), paidResult(), ctx)).toBeNull();
  });
  it("pre-013 orders (no payable_amount) still verify against amount", () => {
    const order = baseOrder({ payable_amount: null });
    expect(validateVerificationEvidence(order, paidResult({ amount: "500.00" }), ctx)).toBeNull();
    expect(validateVerificationEvidence(order, paidResult({ amount: "500.01" }), ctx)).toMatch(/Amount/);
  });
  it("Paytm Business verifier: amount == amount but != payable → pending; == payable → paid", async () => {
    const account = { id: 3, credentials: { mid: "MID123" }, environment: "live" };
    const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    const orderLike = {
      id: 1, order_no: "ORDABCDEFGHIJKLMN", amount: "100.00", payable_amount: "100.01",
      payment_account_id: 3,
      original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 60 * 1000).toISOString(),
    };
    const body = (amt: string) => ({
      STATUS: "TXN_SUCCESS", ORDERID: orderLike.order_no, TXNAMOUNT: amt, CURRENCY: "INR",
      BANKTXNID: "123456789012", TXNID: "T1", TXNDATE: "2026-11-11 12:00:00",
    });
    const wrong = await checkPaytmBusiness(orderLike, account, async () => jsonRes(body("100.00")));
    expect(wrong.paid).toBe(false);
    expect(wrong.code).toBe("amount_mismatch");
    const right = await checkPaytmBusiness(orderLike, account, async () => jsonRes(body("100.01")));
    expect(right.paid).toBe(true);
  });
});

describe("intent and API shape carry payable_amount", () => {
  it("upi intent encodes am = payable_amount; falls back to amount when unset", () => {
    const account = { provider: "paytm_business", upi_id: "shop@paytm", payee_name: "Shop" };
    expect(upiIntentUrl(baseOrder(), account)).toContain("am=500.01");
    expect(upiIntentUrl(baseOrder({ payable_amount: null }), account)).toContain("am=500.00");
  });
  it("toApiArray includes payable_amount and qr_method", () => {
    const account = { provider: "manual", upi_id: "shop@okaxis", payee_name: "Shop" };
    const data = toApiArray(baseOrder(), account, "https://example.test");
    expect(data.payable_amount).toBe("500.01");
    expect(data.qr_method).toBe("unique");
    expect(data.upi_intent as string).toContain("am=500.01");
    const legacy = toApiArray(baseOrder({ payable_amount: null }), account, "https://example.test");
    expect(legacy.payable_amount).toBe("500.00");
    expect(legacy.qr_method).toBe("same");
  });
});
