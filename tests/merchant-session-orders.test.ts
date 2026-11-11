// MOCKED (no DB, no network, no DATABASE_URL).
// GAP 1 — session-authenticated order creation: works for the owning
// merchant, 401 without a session, 403 when the payment account belongs to
// another merchant; same createOrder/idempotency/rate-limit path as the
// API-key route (idempotency replay tested here).
// GAP 2 — merchant order list returns only the merchant's own orders;
// merchant detail is null for another merchant's order; dashboard stats
// and settings are scoped to the session merchant.
// GAP 3 — status redirect: only a paid order with an allowlisted
// redirect_url yields a URL (allowedRedirectForStatus, the exact decision
// the GET /api/pay/[orderNo]/status route applies).
import { describe, it, expect, afterEach } from "vitest";
import { __setSqlForTests } from "../lib/db";
import { handleCreateOrderSession, type CreateOrderDeps } from "../lib/api-orders";
import { MemoryIdempotencyStore } from "../lib/idempotency";
import {
  listMerchantOrders, getMerchantOrderDetail, getMerchantSettings, getMerchantDashboard,
} from "../lib/merchant-orders";
import { allowedRedirectForStatus } from "../lib/api-auth";
import type { SessionUser } from "../lib/auth";
import type { OrderRow } from "../lib/orders/types";
import type { CreateOrderInput } from "../lib/orders/create";

afterEach(() => { __setSqlForTests(null); });

const merchant7: SessionUser = {
  id: 7, email: "m7@example.com", name: "Merchant Seven", role: "merchant",
  isActive: true, passwordHashPrefix: "x", passwordConfirmedAt: null, businessName: "Seven Store",
};

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDABCDEFGHIJKLMN", user_id: 7, payment_account_id: null,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "499.00", status: "pending", environment: "live",
    customer_name: "Test", customer_email: null, customer_mobile: "9999999999", note: "hi", redirect_url: null,
    utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 0, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    paid_at: null, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
}

function postReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// Fake Neon sql client: dispatches on the SQL text, records bound values.
function fakeSql(handler: (sqlText: string, values: unknown[]) => unknown[]) {
  const seenValues: unknown[][] = [];
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    seenValues.push(values);
    return handler(strings.join("?"), values);
  };
  return { fn: fn as never, seenValues };
}

describe("GAP 1 — session order creation", () => {
  it("works for the owning merchant (201, live, own user id, default account)", async () => {
    const calls: CreateOrderInput[] = [];
    const deps: CreateOrderDeps = {
      sessionUser: merchant7,
      idempotencyStore: new MemoryIdempotencyStore(),
      createOrderFn: async (input) => { calls.push(input); return baseOrder({ user_id: input.userId, amount: String(input.amount) }); },
    };
    const res = await handleCreateOrderSession(postReq({ amount: 499, payment_account_id: null, customer_name: "Test", customer_mobile: "9999999999", note: "hi" }), deps);
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { order_id: string; status: string } };
    expect(body.success).toBe(true);
    expect(body.data.order_id).toBe("ORDABCDEFGHIJKLMN");
    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe(7);
    expect(calls[0].environment).toBe("live");
    expect(calls[0].amount).toBe(499);
  });

  it("401s without a session", async () => {
    const res = await handleCreateOrderSession(postReq({ amount: 100 }), { sessionUser: null });
    expect(res.status).toBe(401);
  });

  it("403s for a disabled merchant session", async () => {
    const res = await handleCreateOrderSession(postReq({ amount: 100 }), { sessionUser: { ...merchant7, isActive: false } });
    expect(res.status).toBe(403);
  });

  it("403s when the payment account belongs to another merchant (create never runs)", async () => {
    const { fn } = fakeSql((sqlText) => {
      if (sqlText.includes("FROM payment_accounts WHERE id")) return [{ id: 5, user_id: 8 }];
      return [];
    });
    __setSqlForTests(fn);
    let created = false;
    const res = await handleCreateOrderSession(
      postReq({ amount: 100, payment_account_id: 5 }),
      { sessionUser: merchant7, createOrderFn: async (input) => { created = true; return baseOrder({ user_id: input.userId }); } },
    );
    expect(res.status).toBe(403);
    expect(created).toBe(false);
  });

  it("replays the same idempotency key without creating twice", async () => {
    let created = 0;
    const deps: CreateOrderDeps = {
      sessionUser: merchant7,
      idempotencyStore: new MemoryIdempotencyStore(),
      createOrderFn: async (input) => { created++; return baseOrder({ user_id: input.userId, amount: String(input.amount) }); },
    };
    const body = { amount: 250, payment_account_id: null };
    const first = await handleCreateOrderSession(postReq(body, { "Idempotency-Key": "key-123" }), deps);
    const second = await handleCreateOrderSession(postReq(body, { "Idempotency-Key": "key-123" }), deps);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(created).toBe(1);
    expect(await second.json()).toEqual(await first.json());
  });
});

describe("GAP 2 — merchant-scoped reads", () => {
  it("order list returns only the merchant's own orders", async () => {
    const { fn } = fakeSql((sqlText) => {
      if (sqlText.includes("GROUP BY status")) return [{ status: "pending", n: "1" }];
      if (sqlText.includes("FROM orders o")) return [
        { order_no: "ORD-OWN", user_id: 7, client_order_id: "c1", amount: "100.00", status: "pending", environment: "live", customer_name: null, created_at: new Date().toISOString(), account_label: null, account_provider: null },
        { order_no: "ORD-OTHER", user_id: 8, client_order_id: "c2", amount: "999.00", status: "pending", environment: "live", customer_name: null, created_at: new Date().toISOString(), account_label: null, account_provider: null },
      ];
      return [];
    });
    __setSqlForTests(fn);
    const { orders, counts } = await listMerchantOrders(7, { environment: "", status: "", q: "", page: 1 });
    expect(orders.map((o) => o.order_no)).toEqual(["ORD-OWN"]);
    expect(counts.pending).toBe(1);
  });

  it("order detail is null for another merchant's order (404 semantics)", async () => {
    const { fn } = fakeSql((sqlText) => {
      if (sqlText.includes("FROM orders WHERE order_no")) return [baseOrder({ user_id: 8, order_no: "ORDOTHER00000000" })];
      return [];
    });
    __setSqlForTests(fn);
    expect(await getMerchantOrderDetail("ORDOTHER00000000", 7)).toBeNull();
  });

  it("order detail works for the owning merchant", async () => {
    const { fn } = fakeSql((sqlText) => {
      if (sqlText.includes("FROM webhook_logs")) return [];
      if (sqlText.includes("FROM payment_accounts WHERE id")) return [{ id: 3, user_id: 7, label: "Main UPI", provider: "manual", upi_id: "shop@okhdfc", payee_name: "Seven" }];
      if (sqlText.includes("FROM orders WHERE order_no")) return [baseOrder({ payment_account_id: 3 })];
      if (sqlText.includes("FROM users WHERE id")) return [{ name: "Merchant Seven", business_name: "Seven Store" }];
      return [];
    });
    __setSqlForTests(fn);
    const detail = await getMerchantOrderDetail("ORDABCDEFGHIJKLMN", 7);
    expect(detail).not.toBeNull();
    expect(detail!.account?.label).toBe("Main UPI");
    expect(detail!.merchantName).toBe("Seven Store");
    expect(detail!.readOnly).toBe(false);
  });

  it("settings are scoped to the session merchant", async () => {
    const { fn, seenValues } = fakeSql(() => [{
      id: 7, name: "Merchant Seven", email: "m7@example.com", business_name: "Seven Store", phone: "9999999999",
      api_key: "key_abc", sandbox_api_key: "test_key_abc", webhook_url: "https://example.com/hook",
      sandbox_webhook_url: null, rotation_mode: "random", redirect_domains: ["example.com"],
    }]);
    __setSqlForTests(fn);
    const s = await getMerchantSettings(7);
    expect(s?.id).toBe(7);
    expect(s?.apiKey).toBe("key_abc");
    expect(s?.redirectDomains).toEqual(["example.com"]);
    expect(seenValues.flat()).toContain(7);
  });

  it("dashboard stats query is scoped to the session merchant", async () => {
    const { fn, seenValues } = fakeSql((sqlText) => {
      if (sqlText.includes("GROUP BY day")) return [];
      if (sqlText.includes("LIMIT 6")) return [];
      if (sqlText.includes("FILTER (WHERE status")) return [{
        paid_count: "2", pending_count: "1", review_count: "0", closed_count: "2",
        total_amount: "500.00", today_amount: "500.00", today_count: "2",
      }];
      return [];
    });
    __setSqlForTests(fn);
    const stats = await getMerchantDashboard(7, "live");
    expect(stats.paidCount).toBe(2);
    expect(stats.todayAmount).toBe(500);
    expect(seenValues.flat()).toContain(7);
  });
});

describe("GAP 3 — status redirect allowlist", () => {
  it("returns the redirect_url when paid and allowlisted", () => {
    expect(allowedRedirectForStatus(
      { status: "paid", redirect_url: "https://example.com/done" }, ["example.com"],
    )).toBe("https://example.com/done");
  });
  it("omits a non-allowlisted redirect_url when paid", () => {
    expect(allowedRedirectForStatus(
      { status: "paid", redirect_url: "https://evil.example/done" }, ["example.com"],
    )).toBeNull();
  });
  it("omits the redirect when not paid, even if allowlisted", () => {
    expect(allowedRedirectForStatus(
      { status: "pending", redirect_url: "https://example.com/done" }, ["example.com"],
    )).toBeNull();
  });
  it("omits the redirect when the merchant has no allowlisted domains", () => {
    expect(allowedRedirectForStatus(
      { status: "paid", redirect_url: "https://example.com/done" }, [],
    )).toBeNull();
  });
});
