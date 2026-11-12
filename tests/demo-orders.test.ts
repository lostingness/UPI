// MOCKED (no DB, no network, no DATABASE_URL).
// Round 8 — demo payment links (POST /api/demo/orders):
//  - 401 without a session, 403 for a disabled account;
//  - creates exactly ONE sandbox order (never live) via the injected
//    createOrderFn, with the fixed ₹10.00 demo amount, demo customer/note,
//    and no payment account;
//  - returns 201 with demo:true and a /demo/pay/TST… payment URL;
//  - 429 when the rate-limit check denies;
//  - demoPaymentUrl() always points at /demo/pay/<orderNo>.
import { describe, it, expect } from "vitest";
import {
  handleCreateDemoOrder, DEMO_CREATE_LIMIT, DEMO_CREATE_IP_LIMIT,
} from "../lib/demo-orders";
import {
  DEMO_AMOUNT, DEMO_CUSTOMER_NAME, DEMO_NOTE, demoPaymentUrl,
} from "../lib/demo";
import type { SessionUser } from "../lib/auth";
import type { OrderRow } from "../lib/orders/types";
import type { CreateOrderInput } from "../lib/orders/create";
import type { RateLimitResult } from "../lib/rate-limit";

const merchant7: SessionUser = {
  id: 7, email: "m7@example.com", name: "Merchant Seven", role: "merchant",
  isActive: true, passwordHashPrefix: "x", passwordConfirmedAt: null, businessName: "Seven Store",
};

function demoOrder(over: Partial<OrderRow> = {}): OrderRow {
  const now = new Date();
  return {
    id: 1, order_no: "TSTABCDEFGHIJKLMNOP", user_id: 7, payment_account_id: null,
    client_order_id: "TSTABCDEFGHIJKLMNOP", amount: "10.00", status: "pending", environment: "sandbox",
    customer_name: DEMO_CUSTOMER_NAME, customer_email: null, customer_mobile: null, note: DEMO_NOTE,
    redirect_url: null, utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 0,
    review_note: null, provider_txn_id: null, provider_response: null, provider_checkout: null,
    verified_by: null, paid_at: null,
    expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    original_expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: now.toISOString(), updated_at: now.toISOString(),
    ...over,
  };
}

function postReq(): Request {
  return new Request("http://localhost:3000/api/demo/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

const allow: RateLimitResult = { allowed: true, limit: 100, remaining: 99 };
const deny: RateLimitResult = { allowed: false, limit: 30, remaining: 0, retryAfterSeconds: 42 };

describe("demoPaymentUrl", () => {
  it("points at /demo/pay/<orderNo> — the path itself says DEMO", () => {
    expect(demoPaymentUrl("TSTABCDEFGHIJKLMNOP")).toContain("/demo/pay/TSTABCDEFGHIJKLMNOP");
  });
});

describe("handleCreateDemoOrder", () => {
  it("creates one sandbox order with the fixed demo amount and returns its demo link", async () => {
    const seen: CreateOrderInput[] = [];
    const res = await handleCreateDemoOrder(postReq(), {
      sessionUser: merchant7,
      rateLimitCheck: () => allow,
      createOrderFn: async (input) => { seen.push(input); return demoOrder(); },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data.demo).toBe(true);
    expect(body.data.order_id).toBe("TSTABCDEFGHIJKLMNOP");
    expect(body.data.environment).toBe("sandbox");
    expect(body.data.amount).toBe("10.00");
    expect(body.data.currency).toBe("INR");
    expect(body.data.status).toBe("pending");
    expect(String(body.data.payment_url)).toContain("/demo/pay/TSTABCDEFGHIJKLMNOP");
    expect(String(body.data.payment_url)).not.toContain("/sandbox/pay/");
    expect(String(body.data.payment_url)).not.toContain("/pay/ORD");
    // Exactly one creation, sandbox only, fixed demo amount, no account.
    expect(seen).toHaveLength(1);
    expect(seen[0].environment).toBe("sandbox");
    expect(seen[0].environment).not.toBe("live");
    expect(seen[0].amount).toBe(DEMO_AMOUNT);
    expect(seen[0].userId).toBe(7);
    expect(seen[0].customerName).toBe(DEMO_CUSTOMER_NAME);
    expect(seen[0].note).toBe(DEMO_NOTE);
    expect(seen[0].paymentAccountId ?? null).toBeNull();
  });

  it("401 without a session", async () => {
    const res = await handleCreateDemoOrder(postReq(), {
      sessionUser: null, rateLimitCheck: () => allow,
      createOrderFn: async () => demoOrder(),
    });
    expect(res.status).toBe(401);
  });

  it("403 for a disabled account", async () => {
    const res = await handleCreateDemoOrder(postReq(), {
      sessionUser: { ...merchant7, isActive: false }, rateLimitCheck: () => allow,
      createOrderFn: async () => demoOrder(),
    });
    expect(res.status).toBe(403);
  });

  it("429 when the rate-limit check denies, and creates nothing", async () => {
    let created = 0;
    const res = await handleCreateDemoOrder(postReq(), {
      sessionUser: merchant7,
      rateLimitCheck: () => deny,
      createOrderFn: async () => { created += 1; return demoOrder(); },
    });
    expect(res.status).toBe(429);
    expect(created).toBe(0);
  });

  it("uses the documented limits (30/min per merchant, 60/min per IP)", () => {
    expect(DEMO_CREATE_LIMIT).toBe(30);
    expect(DEMO_CREATE_IP_LIMIT).toBe(60);
    expect(DEMO_AMOUNT).toBe(10);
  });
});
