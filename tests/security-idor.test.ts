// Round 7 — security regression suite (Phase 1 groups 1–9).
// MOCKED (in-memory fake Neon client via __setSqlForTests + mocked
// next/headers cookies; no DB, no network, no DATABASE_URL).
// Two merchants A (id 7) and B (id 8), one admin (id 1), one disabled
// merchant D (id 9). Every cross-merchant test asserts BOTH the status code
// AND that the foreign row is unchanged in the fake DB.
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { __setSqlForTests } from "../lib/db";
import { createSessionToken } from "../lib/auth";
import { assertOwns } from "../lib/auth";
import { ApiError, toApiError } from "../lib/errors";
import { encryptText } from "../lib/crypto";
import { assertAccountOwnedBy, listMerchantOrders, getMerchantOrderDetail, getMerchantSettings, getMerchantDashboard } from "../lib/merchant-orders";
import { listNotifications } from "../lib/notifications";
import { getAccount, listAccounts } from "../lib/accounts";
import { authenticateApiKey, allowedRedirectForStatus } from "../lib/api-auth";
import { validateVerificationEvidence } from "../lib/orders/mark-paid";
import { checkOrder } from "../lib/orders/check";
import { adminOverrideAllowed } from "../lib/orders/admin-override";
import { utrApproveWithinGrace, maskUtr } from "../lib/orders/utr";
import { settingsProfileSchema, parseBody } from "../lib/validate";
import { isCronAuthorized } from "../lib/cron-handlers";
import { POST as approveUtr } from "../app/api/orders/[orderNo]/approve-utr/route";
import { POST as rejectUtr } from "../app/api/orders/[orderNo]/reject-utr/route";
import { POST as verifyOrder } from "../app/api/orders/[orderNo]/verify/route";
import { POST as recheckOrder } from "../app/api/orders/[orderNo]/recheck/route";
import { POST as markPaid } from "../app/api/orders/[orderNo]/mark-paid/route";
import { DELETE as deleteAccount } from "../app/api/accounts/[id]/route";
import { POST as profileUpdate } from "../app/api/settings/profile/route";
import { GET as v1OrderDetail } from "../app/api/v1/orders/[orderNo]/route";
import { POST as simulate } from "../app/api/sandbox/pay/[orderNo]/simulate/route";
import { POST as manualOverride } from "../app/api/admin/orders/[orderNo]/manual-payment-override/route";
import type { OrderRow } from "../lib/orders/types";
import type { VerificationResult } from "../lib/verifiers/verification-result";

// next/headers has no request scope under vitest: mock cookies() so
// getSession()/requireSession() can read a real signed JWT set by each test.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (_name: string) => {
      const v = (globalThis as unknown as { __mockSessionCookie?: string }).__mockSessionCookie;
      return v ? { value: v } : undefined;
    },
    set: () => {},
    delete: () => {},
  }),
}));

process.env.SESSION_SECRET = "test-session-secret-32-chars!!";
process.env.ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
process.env.CRON_SECRET = "test-cron-secret";

const PW = "pw-hash-0123456789abcdef0123456789abcdef";
const SEC_A_LIVE = "sec-aaaa-0000000000000000000000000000";
const SEC_A_SANDBOX = "test-sec-aaaa-000000000000000000000000";
const SEC_B_LIVE = "sec-bbbb-0000000000000000000000000000";
const SEC_B_SANDBOX = "test-sec-bbbb-000000000000000000000000";
const SEC_ADMIN_LIVE = "sec-admin-00000000000000000000000000";
const SEC_D_LIVE = "sec-dddd-0000000000000000000000000000";
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDAAAAAAAAAAAAAAA", user_id: 7, payment_account_id: 3,
    client_order_id: "ORDAAAAAAAAAAAAAAA", amount: "100.00", status: "pending", environment: "live",
    customer_name: "A Customer", customer_email: null, customer_mobile: null, note: null, redirect_url: null,
    utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 0, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    payable_amount: "100.00",
    paid_at: null, expires_at: iso(now + 15 * 60 * 1000),
    original_expires_at: iso(now + 15 * 60 * 1000),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: iso(now - 60 * 1000), updated_at: iso(now),
    ...over,
  };
}

interface FakeUser {
  id: number; name: string; email: string; role: string; is_active: boolean;
  password: string; business_name: string | null; api_key: string; sandbox_api_key: string;
  api_secret: string; sandbox_api_secret: string; webhook_url: string | null;
  sandbox_webhook_url: string | null; webhook_secret: string | null;
  sandbox_webhook_secret: string | null; redirect_domains: string[]; rotation_mode: string;
}
interface FakeDb {
  orders: OrderRow[];
  users: FakeUser[];
  accounts: { id: number; user_id: number; label: string; provider: string; upi_id: string | null; payee_name: string | null; is_active: boolean; is_default: boolean; daily_limit: string | null; created_at: string; credentials: string | null }[];
  notifications: { id: number; user_id: number; order_id: number | null; order_no: string | null; type: string; title: string; body: string; amount: string | null; is_read: boolean; read_at: string | null; created_at: string }[];
  guards: { name: string; user_id: number }[];
  queries: string[];
  valuesSeen: unknown[][];
}

function buildDb(): FakeDb {
  const user = (over: Partial<FakeUser>): FakeUser => ({
    id: 7, name: "Merchant Seven", email: "m7@example.com", role: "merchant", is_active: true,
    password: PW, business_name: "Seven Store", api_key: "key_aaaa", sandbox_api_key: "test_key_aaaa",
    api_secret: encryptText(SEC_A_LIVE),
    sandbox_api_secret: encryptText(SEC_A_SANDBOX),
    webhook_url: null, sandbox_webhook_url: null, webhook_secret: null, sandbox_webhook_secret: null,
    redirect_domains: [], rotation_mode: "random", ...over,
  });
  return {
    orders: [
      baseOrder(),
      baseOrder({ id: 2, order_no: "ORDREVIEWAAAAAAAA", client_order_id: "ORDREVIEWAAAAAAAA", status: "review", customer_utr: "123456789012", utr_attempts: 1, utr_submitted_at: iso(now - 60 * 1000) }),
      baseOrder({ id: 3, order_no: "ORDBBBBBBBBBBBBBBB", client_order_id: "ORDBBBBBBBBBBBBBBB", user_id: 8, payment_account_id: 5 }),
      baseOrder({ id: 4, order_no: "TSTAAAAAAAAAAAAAAA", client_order_id: "TSTAAAAAAAAAAAAAAA", environment: "sandbox", payment_account_id: null }),
      baseOrder({ id: 5, order_no: "ORDEXPIREDGRACEAA", client_order_id: "ORDEXPIREDGRACEAA", status: "expired", expires_at: iso(now - 60 * 60 * 1000), original_expires_at: iso(now - 60 * 60 * 1000) }),
      baseOrder({ id: 6, order_no: "ORDEXPIREDSTALEAA", client_order_id: "ORDEXPIREDSTALEAA", status: "expired", expires_at: iso(now - 25 * 60 * 60 * 1000), original_expires_at: iso(now - 25 * 60 * 60 * 1000) }),
      baseOrder({ id: 7, order_no: "ORDPAIDAAAAAAAAAAA", client_order_id: "ORDPAIDAAAAAAAAAAA", status: "paid", utr: "999999999999", paid_at: iso(now - 30 * 60 * 1000) }),
    ],
    users: [
      user({ id: 1, name: "Admin", email: "admin@example.com", role: "admin", business_name: null, api_key: "key_admin", sandbox_api_key: "test_key_admin", api_secret: encryptText(SEC_ADMIN_LIVE), sandbox_api_secret: encryptText("test-sec-admin-00000000000000000000") }),
      user({}),
      user({ id: 8, name: "Merchant Eight", email: "m8@example.com", business_name: "Eight Store", api_key: "key_bbbb", sandbox_api_key: "test_key_bbbb", api_secret: encryptText(SEC_B_LIVE), sandbox_api_secret: encryptText(SEC_B_SANDBOX) }),
      user({ id: 9, name: "Disabled", email: "d@example.com", is_active: false, api_key: "key_dddd", sandbox_api_key: "test_key_dddd", api_secret: encryptText(SEC_D_LIVE), sandbox_api_secret: encryptText("test-sec-dddd-000000000000000000000000") }),
    ],
    accounts: [
      { id: 3, user_id: 7, label: "Main UPI", provider: "manual", upi_id: "seven@okhdfc", payee_name: "Seven", is_active: true, is_default: true, daily_limit: null, created_at: iso(now - 86400 * 1000), credentials: null },
      { id: 5, user_id: 8, label: "Eight UPI", provider: "manual", upi_id: "eight@okhdfc", payee_name: "Eight", is_active: true, is_default: true, daily_limit: null, created_at: iso(now - 86400 * 1000), credentials: null },
    ],
    notifications: [
      { id: 1, user_id: 7, order_id: 1, order_no: "ORDAAAAAAAAAAAAAAA", type: "payment_received", title: "Payment received", body: "", amount: "100.00", is_read: false, read_at: null, created_at: iso(now) },
      { id: 2, user_id: 8, order_id: 3, order_no: "ORDBBBBBBBBBBBBBBB", type: "payment_received", title: "Payment received", body: "", amount: "100.00", is_read: false, read_at: null, created_at: iso(now) },
    ],
    guards: [],
    queries: [],
    valuesSeen: [],
  };
}

// Fake Neon client: dispatches on SQL text, mutates the in-memory rows the
// way the real statements would, and records every query for assertions
// ("no UPDATE/DELETE touched the foreign row").
function installFake(db: FakeDb) {
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    db.queries.push(sqlText);
    db.valuesSeen.push(values);
    const has = (s: string) => sqlText.includes(s);
    if (has("CREATE TABLE") || has("CREATE INDEX") || has("CREATE UNIQUE INDEX") || has("ALTER TABLE")) return [];
    // --- UTR approve / admin override / sandbox simulate (paid transitions) ---
    if (has("UPDATE orders SET status = 'paid', utr =")) {
      const ref = String(values[0]);
      const id = Number(values[values.length - 1]);
      const o = db.orders.find((r) => r.id === id);
      if (!o) return [];
      if (has("verified_by = 'sandbox'")) {
        if (o.status !== "pending" || o.sandbox_simulated_at) return [];
        o.status = "paid"; o.utr = ref; o.provider_txn_id = String(values[1]);
        o.verified_by = "sandbox"; o.paid_at = iso(Date.now()); o.sandbox_simulated_at = iso(Date.now());
        return [{ ...o }];
      }
      if (has("admin_override")) {
        if (o.status !== "review" && o.status !== "expired") return [];
        o.status = "paid"; o.utr = ref; o.provider_txn_id = ref; o.verified_by = "admin_override"; o.paid_at = iso(Date.now());
      } else {
        if (o.status !== "review") return [];
        o.status = "paid"; o.utr = ref; o.verified_by = "utr_review"; o.paid_at = iso(Date.now());
      }
      return [{ ...o }];
    }
    // --- UTR reject ---
    if (has("UPDATE orders SET status = 'pending', customer_utr = NULL")) {
      const id = Number(values[values.length - 1]);
      const o = db.orders.find((r) => r.id === id);
      if (!o || o.status !== "review") return [];
      o.status = "pending"; o.customer_utr = null; o.review_note = String(values[0]);
      return [{ ...o }];
    }
    if (has("UPDATE orders SET status = 'expired', customer_utr = NULL")) {
      const id = Number(values[values.length - 1]);
      const o = db.orders.find((r) => r.id === id);
      if (!o || o.status !== "review") return [];
      o.status = "expired"; o.customer_utr = null; o.review_note = String(values[0]);
      return [{ ...o }];
    }
    // --- outbox / notifications / audit ---
    if (has("UPDATE orders SET webhook_event_sequence")) {
      const id = Number(values[0]);
      const o = db.orders.find((r) => r.id === id);
      if (o) o.webhook_event_sequence += 1;
      return [{ webhook_event_sequence: o ? o.webhook_event_sequence : 1 }];
    }
    if (has("INSERT INTO webhook_outbox")) return [{ id: 1, event_id: "e1", order_id: 1, sequence: 1, transition_key: "k", event: "order.paid", environment: "live", status: "pending" }];
    if (has("INSERT INTO upi_notifications")) return [{ id: 99, user_id: Number(values[0]), order_id: Number(values[1]), order_no: String(values[2]), type: String(values[3]), title: String(values[4]), body: String(values[5]), amount: values[6] as string | null, is_read: false, read_at: null, created_at: iso(Date.now()) }];
    if (has("INSERT INTO admin_audit_logs")) return [];
    if (has("UPDATE upi_amount_allocations SET status = 'released'")) return [];
    // --- order reads ---
    if (has("FROM orders WHERE order_no")) {
      const o = db.orders.find((r) => r.order_no === String(values[0]));
      return o ? [{ ...o }] : [];
    }
    if (has("FROM orders WHERE client_order_id")) {
      const o = db.orders.find((r) => r.client_order_id === String(values[0]) && Number(r.user_id) === Number(values[1]) && r.environment === values[2]);
      return o ? [{ ...o }] : [];
    }
    if (has("SELECT id FROM orders WHERE user_id")) {
      // Values: [user_id, utr, utr, selfId] — the UTR is bound twice
      // (utr = ? OR customer_utr = ?).
      const [uid, utr, , self] = values as [number, string, string, number?];
      return db.orders.filter((r) => Number(r.user_id) === Number(uid) && (r.utr === utr || r.customer_utr === utr) && (self === undefined || r.id !== Number(self))).map((r) => ({ id: r.id }));
    }
    if (has("SELECT id FROM orders WHERE payment_account_id")) {
      return db.orders.filter((r) => Number(r.payment_account_id) === Number(values[0])).map((r) => ({ id: r.id }));
    }
    if (has("FROM orders o")) {
      // listMerchantOrders: return every row — the function must filter in JS.
      return db.orders.map((r) => ({ ...r, account_label: null, account_provider: null }));
    }
    if (has("GROUP BY status")) return [{ status: "pending", n: "1" }];
    // --- accounts (DELETE first: its text contains "FROM payment_accounts WHERE id") ---
    if (has("DELETE FROM payment_accounts")) {
      const idx = db.accounts.findIndex((x) => x.id === Number(values[0]));
      if (idx >= 0) db.accounts.splice(idx, 1);
      return [];
    }
    if (has("FROM payment_accounts WHERE id") && has("AND user_id")) {
      const a = db.accounts.find((x) => x.id === Number(values[0]) && x.user_id === Number(values[1]));
      return a ? [{ ...a }] : [];
    }
    if (has("FROM payment_accounts WHERE id")) {
      const a = db.accounts.find((x) => x.id === Number(values[0]));
      return a ? [{ ...a }] : [];
    }
    if (has("FROM payment_accounts WHERE user_id")) {
      return db.accounts.filter((x) => x.user_id === Number(values[0])).map((a) => ({ ...a }));
    }
    // --- users ---
    if (has("FROM users WHERE id")) {
      const u = db.users.find((x) => x.id === Number(values[0]));
      return u ? [{ ...u }] : [];
    }
    if (has("FROM users WHERE api_key") || has("FROM users WHERE sandbox_api_key")) {
      const u = db.users.find((x) => x.api_key === String(values[0]) || x.sandbox_api_key === String(values[0]));
      return u ? [{ ...u }] : [];
    }
    if (has("SELECT redirect_domains FROM users")) {
      const u = db.users.find((x) => x.id === Number(values[0]));
      return u ? [{ redirect_domains: u.redirect_domains }] : [];
    }
    if (has("UPDATE users SET name")) return [];
    // --- dashboard ---
    if (has("FILTER (WHERE status")) return [{ paid_count: "1", pending_count: "1", review_count: "0", closed_count: "1", total_amount: "100.00", today_amount: "100.00", today_count: "1" }];
    if (has("GROUP BY day")) return [];
    if (has("LIMIT 6")) return db.orders.filter((r) => Number(r.user_id) === Number(values[0])).map((r) => ({ ...r }));
    // --- notifications reads ---
    if (has("COUNT(*)::int AS count FROM upi_notifications")) {
      return [{ count: db.notifications.filter((n) => n.user_id === Number(values[0]) && !n.is_read).length }];
    }
    if (has("FROM upi_notifications WHERE user_id")) {
      return db.notifications.filter((n) => n.user_id === Number(values[0])).map((n) => ({ ...n }));
    }
    if (has("FROM webhook_logs")) return [];
    if (has("UPDATE orders SET provider_response")) return [];
    if (has("UPDATE orders SET verification_token")) return [];
    if (has("INSERT INTO upi_rate_limits")) return [{ count: 1 }];
    return [];
  };
  __setSqlForTests(fn as never);
  (db as FakeDb & { sql: unknown }).sql = fn;
  return db;
}

function postReq(url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function getReq(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "GET", headers });
}
async function asUser(userId: number, role = "merchant", passwordConfirmedAt?: number) {
  const token = await createSessionToken({ id: userId, role, password: PW }, passwordConfirmedAt);
  (globalThis as unknown as { __mockSessionCookie?: string }).__mockSessionCookie = token;
}
function clearUser() {
  (globalThis as unknown as { __mockSessionCookie?: string }).__mockSessionCookie = undefined;
}

afterEach(() => { __setSqlForTests(null); clearUser(); });
beforeEach(() => { clearUser(); });

const paramsFor = (orderNo: string) => ({ params: Promise.resolve({ orderNo }) });
const idParamsFor = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Group 1 — cross-order access (merchant A vs merchant B)", () => {
  it("A cannot read B's order detail (null → 404)", async () => {
    const db = installFake(buildDb());
    expect(await getMerchantOrderDetail("ORDBBBBBBBBBBBBBBB", 7)).toBeNull();
    expect(db.orders.find((o) => o.id === 3)).toMatchObject({ user_id: 8, status: "pending" });
  });
  it("A reads their own order detail", async () => {
    installFake(buildDb());
    const d = await getMerchantOrderDetail("ORDAAAAAAAAAAAAAAA", 7);
    expect(d?.order.user_id).toBe(7);
  });
  it("order list returns only the caller's orders even when SQL returns both", async () => {
    installFake(buildDb());
    const { orders } = await listMerchantOrders(7, { environment: "", status: "", q: "", page: 1 });
    expect(orders.map((o) => o.order_no)).toEqual(["ORDAAAAAAAAAAAAAAA", "ORDREVIEWAAAAAAAA", "TSTAAAAAAAAAAAAAAA", "ORDEXPIREDGRACEAA", "ORDEXPIREDSTALEAA", "ORDPAIDAAAAAAAAAAA"]);
  });
  it("assertOwns throws 404 (not 403) for a foreign order", () => {
    try { assertOwns(7, 8); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(404); }
  });
  it("B's verify/recheck on A's order → 404 and A's order unchanged", async () => {
    const db = installFake(buildDb());
    await asUser(8);
    const v = await verifyOrder(postReq("http://localhost:3000/api/orders/ORDAAAAAAAAAAAAAAA/verify"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(v.status).toBe(404);
    const r = await recheckOrder(postReq("http://localhost:3000/api/orders/ORDAAAAAAAAAAAAAAA/recheck"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(r.status).toBe(404);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", user_id: 7 });
    expect(db.queries.join(" ")).not.toContain("verification_token");
  });
  it("A's verify on their own order → 200", async () => {
    installFake(buildDb());
    await asUser(7);
    const v = await verifyOrder(postReq("http://localhost:3000/api/orders/ORDAAAAAAAAAAAAAAA/verify"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(v.status).toBe(200);
  });
});

describe("Group 2 — status / verify / recheck ownership", () => {
  it("recheck by the owner runs the (throttled) check; by B it 404s", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const okRes = await recheckOrder(postReq("http://localhost:3000/api/orders/ORDAAAAAAAAAAAAAAA/recheck"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(okRes.status).toBe(200);
    await asUser(8);
    const badRes = await recheckOrder(postReq("http://localhost:3000/api/orders/ORDAAAAAAAAAAAAAAA/recheck"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(badRes.status).toBe(404);
    expect(db.orders.find((o) => o.id === 1)?.status).toBe("pending");
  });
  it("mark-paid route is disabled for everyone (422, no state change)", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await markPaid();
    expect(res.status).toBe(422);
    const body = await res.json() as { data: { message: string } };
    expect(body.data.message).toMatch(/disabled/i);
    expect(db.orders.find((o) => o.id === 1)?.status).toBe("pending");
  });
  it("provider evidence is rejected on environment mismatch (disabled/sandbox account cannot mark paid)", () => {
    const order = baseOrder();
    const v: VerificationResult = {
      paid: true, utr: "123456789012", txnId: "TXN1", raw: {}, provider: "paytm_business",
      orderId: 1, orderNumber: order.order_no, amount: "100.00", currency: "INR",
      verifiedAt: new Date(), paymentAccountId: 3, environment: "live",
      originalExpiresAt: new Date(order.original_expires_at!), occurredAt: new Date(),
    };
    expect(validateVerificationEvidence(order, v, { accountProvider: "paytm_business", accountId: 3, accountEnvironment: "sandbox" })).toMatch(/Environment/);
  });
  it("checkOrder on a sandbox order never touches a provider (no account load)", async () => {
    const db = installFake(buildDb());
    const order = db.orders.find((o) => o.id === 4)!;
    const after = await checkOrder({ ...order });
    expect(after.status).toBe("pending");
    expect(db.queries.join(" ")).not.toContain("FROM payment_accounts WHERE id");
  });
});

describe("Group 3 — approve / reject UTR ownership", () => {
  it("B approving A's review order → 404, order stays in review with UTR intact", async () => {
    const db = installFake(buildDb());
    await asUser(8);
    const res = await approveUtr(postReq("http://localhost:3000/api/orders/ORDREVIEWAAAAAAAA/approve-utr", { bank_utr: "123456789012", received_amount: 100 }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(404);
    expect(db.orders.find((o) => o.id === 2)).toMatchObject({ status: "review", customer_utr: "123456789012", utr_attempts: 1 });
  });
  it("A approving their own review order → 200 paid, UTR recorded", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await approveUtr(postReq("http://localhost:3000/api/orders/ORDREVIEWAAAAAAAA/approve-utr", { bank_utr: "123456789012", received_amount: 100 }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(200);
    expect(db.orders.find((o) => o.id === 2)).toMatchObject({ status: "paid", utr: "123456789012" });
  });
  it("B rejecting A's review order → 404, order unchanged", async () => {
    const db = installFake(buildDb());
    await asUser(8);
    const res = await rejectUtr(postReq("http://localhost:3000/api/orders/ORDREVIEWAAAAAAAA/reject-utr", { reason: "not found" }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(404);
    expect(db.orders.find((o) => o.id === 2)).toMatchObject({ status: "review", customer_utr: "123456789012" });
  });
  it("A rejecting their own review order → 200 pending with customer_utr CLEARED (G5)", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await rejectUtr(postReq("http://localhost:3000/api/orders/ORDREVIEWAAAAAAAA/reject-utr", { reason: "not found" }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(200);
    expect(db.orders.find((o) => o.id === 2)).toMatchObject({ status: "pending", customer_utr: null });
  });
  it("G3: approve past the late-payment grace window is refused (pure gate)", () => {
    const stale = baseOrder({ status: "review", expires_at: iso(now - 25 * 60 * 60 * 1000), original_expires_at: iso(now - 25 * 60 * 60 * 1000) });
    expect(utrApproveWithinGrace(stale)).toBe(false);
    const fresh = baseOrder({ status: "review" });
    expect(utrApproveWithinGrace(fresh)).toBe(true);
  });
  it("M2: the bank UTR masks to last-4 on the public surface", () => {
    expect(maskUtr("123456789012")).toBe("••••••••9012");
    expect(maskUtr(null)).toBeNull();
    expect(maskUtr("1234")).toBe("••••");
  });
});

describe("Group 4 — foreign payment_account_id (L1: 403 → 422)", () => {
  it("assertAccountOwnedBy throws 422 (not 403) for another merchant's account", async () => {
    installFake(buildDb());
    try { await assertAccountOwnedBy(7, 5); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(ApiError); expect((e as ApiError).status).toBe(422); }
  });
  it("assertAccountOwnedBy passes for the owner's account and for a nonexistent id", async () => {
    installFake(buildDb());
    await expect(assertAccountOwnedBy(7, 3)).resolves.toBeUndefined();
    await expect(assertAccountOwnedBy(7, 999)).resolves.toBeUndefined();
  });
});

describe("Group 5 — account delete / toggle isolation", () => {
  it("B deleting A's account → 404, A's account still exists", async () => {
    const db = installFake(buildDb());
    await asUser(8);
    const res = await deleteAccount(new Request("http://localhost:3000/api/accounts/3", { method: "DELETE" }), idParamsFor("3"));
    expect(res.status).toBe(404);
    expect(db.accounts.some((a) => a.id === 3)).toBe(true);
    expect(db.queries.join(" ")).not.toContain("DELETE FROM payment_accounts");
  });
  it("A deleting their own account with no orders → 200 and the row is gone", async () => {
    const db = installFake(buildDb());
    // Give A an order-free account to delete.
    db.accounts.push({ id: 9, user_id: 7, label: "Spare", provider: "manual", upi_id: "spare@okhdfc", payee_name: "Seven", is_active: true, is_default: false, daily_limit: null, created_at: iso(now), credentials: null });
    await asUser(7);
    const res = await deleteAccount(new Request("http://localhost:3000/api/accounts/9", { method: "DELETE" }), idParamsFor("9"));
    expect(res.status).toBe(200);
    expect(db.accounts.some((a) => a.id === 9)).toBe(false);
  });
  it("A deleting their own account WITH orders → 422, account kept", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await deleteAccount(new Request("http://localhost:3000/api/accounts/3", { method: "DELETE" }), idParamsFor("3"));
    expect(res.status).toBe(422);
    expect(db.accounts.some((a) => a.id === 3)).toBe(true);
  });
  it("getAccount is scoped (404 for foreign) and listAccounts returns only the caller's", async () => {
    const db = installFake(buildDb());
    await expect(getAccount(5, 7)).rejects.toMatchObject({ status: 404 });
    expect((await listAccounts(7)).map((a) => a.id)).toEqual([3]);
    expect(db.queries.filter((q) => q.includes("FROM payment_accounts WHERE user_id")).length).toBe(1);
  });
});

describe("Group 6 — v1 API cross-access + API-key role check (L4)", () => {
  function keyHeaders(key: string, secret: string) {
    return { "x-api-key": key, "x-api-secret": secret };
  }
  it("B's live key cannot read A's live order (404, no checkOrder on it)", async () => {
    const db = installFake(buildDb());
    const res = await v1OrderDetail(getReq("http://localhost:3000/api/v1/orders/ORDAAAAAAAAAAAAAAA", keyHeaders("key_bbbb", SEC_B_LIVE)), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(404);
    expect(db.orders.find((o) => o.id === 1)?.status).toBe("pending");
  });
  it("A's live key reads A's live order (200)", async () => {
    installFake(buildDb());
    const res = await v1OrderDetail(getReq("http://localhost:3000/api/v1/orders/ORDAAAAAAAAAAAAAAA", keyHeaders("key_aaaa", SEC_A_LIVE)), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(200);
  });
  it("A's SANDBOX key cannot read A's LIVE order (environment scope, 404)", async () => {
    installFake(buildDb());
    const res = await v1OrderDetail(getReq("http://localhost:3000/api/v1/orders/ORDAAAAAAAAAAAAAAA", keyHeaders("test_key_aaaa", SEC_A_SANDBOX)), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(404);
  });
  it("an ADMIN's API key is rejected for the merchant v1 API (L4: 403)", async () => {
    installFake(buildDb());
    await expect(authenticateApiKey(new Request("http://localhost:3000/api/v1/orders/x", { headers: keyHeaders("key_admin", SEC_ADMIN_LIVE) }))).rejects.toMatchObject({ status: 403 });
    const m = await authenticateApiKey(new Request("http://localhost:3000/api/v1/orders/x", { headers: keyHeaders("key_aaaa", SEC_A_LIVE) }));
    expect(m.id).toBe(7);
    expect(m.role).toBe("merchant");
  });
  it("a DISABLED merchant's API key is rejected (403)", async () => {
    installFake(buildDb());
    await expect(authenticateApiKey(new Request("http://localhost:3000/api/v1/orders/x", { headers: keyHeaders("key_dddd", SEC_D_LIVE) }))).rejects.toMatchObject({ status: 403 });
  });
  it("a wrong API secret is a generic 401 (no oracle)", async () => {
    installFake(buildDb());
    await expect(authenticateApiKey(new Request("http://localhost:3000/api/v1/orders/x", { headers: keyHeaders("key_aaaa", "sec-wrong-000000000000000000000000000") }))).rejects.toMatchObject({ status: 401 });
  });
});

describe("Group 7 — dashboard / settings / notifications isolation", () => {
  it("settings are scoped to the session merchant", async () => {
    const db = installFake(buildDb());
    const s = await getMerchantSettings(7);
    expect(s?.id).toBe(7);
    expect(s?.email).toBe("m7@example.com");
    expect(db.valuesSeen.flat()).toContain(7);
    expect(db.valuesSeen.flat()).not.toContain(8);
  });
  it("dashboard stats are scoped to the session merchant", async () => {
    const db = installFake(buildDb());
    const stats = await getMerchantDashboard(7, "live");
    expect(stats.paidCount).toBe(1);
    expect(db.valuesSeen.flat()).toContain(7);
    expect(db.valuesSeen.flat()).not.toContain(8);
  });
  it("notifications list returns only the caller's rows", async () => {
    const db = installFake(buildDb());
    const { notifications, unreadCount } = await listNotifications((db as FakeDb & { sql: unknown }).sql as never, 7);
    expect(notifications.map((n) => n.id)).toEqual([1]);
    expect(unreadCount).toBe(1);
    expect(db.valuesSeen.flat()).toContain(7);
  });
  it("redirect is only returned for a paid order with an allowlisted domain", () => {
    expect(allowedRedirectForStatus({ status: "paid", redirect_url: "https://example.com/done" }, ["example.com"])).toBe("https://example.com/done");
    expect(allowedRedirectForStatus({ status: "pending", redirect_url: "https://example.com/done" }, ["example.com"])).toBeNull();
    expect(allowedRedirectForStatus({ status: "paid", redirect_url: "https://evil.example/done" }, ["example.com"])).toBeNull();
  });
});

describe("Group 8 — settings mass-assignment / role escalation", () => {
  it("the profile schema strips role / is_active / api_key (zod strips unknown keys)", () => {
    const data = parseBody(settingsProfileSchema, { name: "New Name", role: "admin", is_active: false, api_key: "key_evil" });
    expect(data).toEqual({ name: "New Name" });
    expect("role" in data).toBe(false);
  });
  it("the profile route UPDATE never touches role (SQL text has no role column)", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await profileUpdate(postReq("http://localhost:3000/api/settings/profile", { name: "New Name", role: "admin" }));
    expect(res.status).toBe(200);
    const update = db.queries.find((q) => q.includes("UPDATE users SET name"));
    expect(update).toBeDefined();
    expect(update).not.toMatch(/role/);
    expect(db.users.find((u) => u.id === 7)?.role).toBe("merchant");
  });
  it("a merchant session cannot reach the admin override route (403)", async () => {
    installFake(buildDb());
    await asUser(7);
    const res = await manualOverride(postReq("http://localhost:3000/api/admin/orders/ORDREVIEWAAAAAAAA/manual-payment-override", { amount: 100, verification_reference: "REF123456", reason: "confirmed against the bank statement today" }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(403);
  });
  it("an admin without a recent password confirmation gets 401 (confirm gate)", async () => {
    installFake(buildDb());
    await asUser(1, "admin"); // no passwordConfirmedAt
    const res = await manualOverride(postReq("http://localhost:3000/api/admin/orders/ORDREVIEWAAAAAAAA/manual-payment-override", { amount: 100, verification_reference: "REF123456", reason: "confirmed against the bank statement today" }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(401);
  });
});

describe("Group 9 — admin override narrowing (G2) + sandbox simulate (L2)", () => {
  it("G2 gate: pending orders cannot be overridden; review and in-grace expired can", () => {
    expect(adminOverrideAllowed(baseOrder({ status: "pending" }))).toMatch(/Only orders under review/);
    expect(adminOverrideAllowed(baseOrder({ status: "review" }))).toBeNull();
    expect(adminOverrideAllowed(baseOrder({ status: "expired", expires_at: iso(now - 60 * 60 * 1000), original_expires_at: iso(now - 60 * 60 * 1000) }))).toBeNull();
    expect(adminOverrideAllowed(baseOrder({ status: "expired", expires_at: iso(now - 25 * 60 * 60 * 1000), original_expires_at: iso(now - 25 * 60 * 60 * 1000) }))).toMatch(/grace window/);
    expect(adminOverrideAllowed(baseOrder({ status: "paid" }))).toMatch(/already paid/);
    expect(adminOverrideAllowed(baseOrder({ status: "review", environment: "sandbox" }))).toMatch(/Only live/);
  });
  it("G2: an admin override on a review order pays it and notifies (route-level, confirmed admin)", async () => {
    const db = installFake(buildDb());
    await asUser(1, "admin", Math.floor(Date.now() / 1000));
    const res = await manualOverride(postReq("http://localhost:3000/api/admin/orders/ORDREVIEWAAAAAAAA/manual-payment-override", { amount: 100, verification_reference: "REF123456", reason: "confirmed against the bank statement today" }), paramsFor("ORDREVIEWAAAAAAAA"));
    expect(res.status).toBe(200);
    expect(db.orders.find((o) => o.id === 2)).toMatchObject({ status: "paid", verified_by: "admin_override" });
    // G11: the override fired a merchant notification (payment_received).
    expect(db.queries.some((q) => q.includes("INSERT INTO upi_notifications"))).toBe(true);
  });
  it("G2: an admin override on a PENDING order is refused (422, order unchanged)", async () => {
    const db = installFake(buildDb());
    await asUser(1, "admin", Math.floor(Date.now() / 1000));
    const res = await manualOverride(postReq("http://localhost:3000/api/admin/orders/ORDAAAAAAAAAAAAAAA/manual-payment-override", { amount: 100, verification_reference: "REF123456", reason: "confirmed against the bank statement today" }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(422);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", utr: null });
  });
  it("G4: a unique-violation (23505) maps to a clean 409, never a 500", () => {
    const { status, body } = toApiError(Object.assign(new Error("duplicate key"), { code: "23505" }));
    expect(status).toBe(409);
    expect(body.message).toMatch(/already in use/);
  });
  it("L2: sandbox simulate by the owning merchant's session → 200 paid", async () => {
    const db = installFake(buildDb());
    await asUser(7);
    const res = await simulate(postReq("http://localhost:3000/api/sandbox/pay/TSTAAAAAAAAAAAAAAA/simulate", { outcome: "success" }), paramsFor("TSTAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(200);
    expect(db.orders.find((o) => o.id === 4)?.status).toBe("paid");
  });
  it("L2: B's session simulating A's sandbox order → 401, order unchanged", async () => {
    const db = installFake(buildDb());
    await asUser(8);
    const res = await simulate(postReq("http://localhost:3000/api/sandbox/pay/TSTAAAAAAAAAAAAAAA/simulate", { outcome: "success" }), paramsFor("TSTAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 4)?.status).toBe("pending");
  });
  it("L2: a DISABLED merchant's session simulating → 401, order unchanged", async () => {
    const db = installFake(buildDb());
    await asUser(9);
    const res = await simulate(postReq("http://localhost:3000/api/sandbox/pay/TSTAAAAAAAAAAAAAAA/simulate", { outcome: "success" }), paramsFor("TSTAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 4)?.status).toBe("pending");
  });
  it("L2: sandbox simulate with no credentials → 401; with B's sandbox key on A's order → 403", async () => {
    const db = installFake(buildDb());
    clearUser();
    const anon = await simulate(postReq("http://localhost:3000/api/sandbox/pay/TSTAAAAAAAAAAAAAAA/simulate", { outcome: "success" }), paramsFor("TSTAAAAAAAAAAAAAAA"));
    expect(anon.status).toBe(401);
    const bKey = await simulate(postReq("http://localhost:3000/api/sandbox/pay/TSTAAAAAAAAAAAAAAA/simulate", { outcome: "success" }, { "x-api-key": "test_key_bbbb", "x-api-secret": SEC_B_SANDBOX }), paramsFor("TSTAAAAAAAAAAAAAAA"));
    expect(bKey.status).toBe(403);
    expect(db.orders.find((o) => o.id === 4)?.status).toBe("pending");
  });
  it("L2: sandbox simulate on a LIVE order → 404", async () => {
    installFake(buildDb());
    await asUser(7);
    const res = await simulate(postReq("http://localhost:3000/api/sandbox/pay/ORDAAAAAAAAAAAAAAA/simulate", { outcome: "success" }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(404);
  });
  it("L8: cron authorisation is constant-time and fails closed", () => {
    expect(isCronAuthorized(new Request("http://localhost:3000/api/cron/x", { headers: { authorization: "Bearer test-cron-secret" } }))).toBe(true);
    expect(isCronAuthorized(new Request("http://localhost:3000/api/cron/x", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
    expect(isCronAuthorized(new Request("http://localhost:3000/api/cron/x"))).toBe(false);
  });
});
