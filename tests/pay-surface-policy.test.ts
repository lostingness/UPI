// Round 7 — pay-surface policy suite (Phase 1 groups 12–14 + group 13).
// MOCKED (in-memory fake Neon client via __setSqlForTests + mocked
// next/headers cookies; no DB, no network, no DATABASE_URL).
// Covers: H1 unauthenticated UTR submit, H2 report-only status + return
// rate limit, M1 per-order start budget, order_no entropy, enumeration
// identical responses, L6/L7 login/register oracles, L8 setup surface,
// group 13 setup double-POST → exactly one admin, pay-token unit
// semantics, G6 Paytm PG response-signature verification, G12 scrubbing.
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { __setSqlForTests } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { encryptText } from "../lib/crypto";
import {
  issuePayTokens, consumePayToken, verifyPayToken, MemoryPayTokenStore,
  newPayToken, isPayTokenFormat, payTokenExpiryFor, checkoutStartAllowed,
  hasPgReturnSignal, START_BUDGET_PER_ORDER,
} from "../lib/pay-token";
import { maskUtr, submitCustomerUtr } from "../lib/orders/utr";
import { scrubProviderResponse } from "../lib/verifiers/verification-result";
import { generatePaytmChecksum } from "../lib/verifiers/paytm-checksum";
import { checkPaytmPg } from "../lib/verifiers/paytm-pg";
import { newOrderNo } from "../lib/orders/create";
import { isInstalled } from "../lib/install";
import { POST as utrSubmit } from "../app/api/pay/[orderNo]/utr/route";
import { GET as payStatus } from "../app/api/pay/[orderNo]/status/route";
import { POST as payStart } from "../app/api/pay/[orderNo]/start/route";
import { GET as payReturn, POST as payReturnPost } from "../app/api/pay/[orderNo]/return/route";
import { POST as login } from "../app/api/auth/login/route";
// NOTE: the register route is imported dynamically inside the L7 tests:
// ALLOW_REGISTRATION is read at gatewayConfig import time, so the env must
// be stubbed + modules reset before the route module is first evaluated.
import { GET as setupGet, POST as setupPost } from "../app/api/setup/route";
import type { OrderRow } from "../lib/orders/types";

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

const PW = "pw-hash-0123456789abcdef0123456789abcdef";
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

interface FakeDb {
  orders: OrderRow[];
  users: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  tokens: { id: number; orderId: number; purpose: string; hash: string; expiresAt: number; usedAt: number | null }[];
  guards: { name: string; user_id: number }[];
  rateBuckets: Map<string, number>;
  queries: string[];
  nextUserId: number;
  nextTokenId: number;
}

function buildDb(pwHash: string): FakeDb {
  const user = (over: Record<string, unknown>): Record<string, unknown> => ({
    id: 7, name: "Merchant Seven", email: "m7@example.com", role: "merchant", is_active: true,
    password: pwHash, business_name: "Seven Store", api_key: "key_aaaa", sandbox_api_key: "test_key_aaaa",
    api_secret: encryptText("sec-aaaa-0000000000000000000000000000"),
    sandbox_api_secret: encryptText("test-sec-aaaa-000000000000000000000000"),
    webhook_url: null, sandbox_webhook_url: null, webhook_secret: null, sandbox_webhook_secret: null,
    redirect_domains: [], rotation_mode: "random", ...over,
  });
  return {
    orders: [
      baseOrder(),
      baseOrder({ id: 2, order_no: "ORDREVIEWAAAAAAAA", client_order_id: "ORDREVIEWAAAAAAAA", status: "review", customer_utr: "123456789012", utr_attempts: 1, utr_submitted_at: iso(now - 60 * 1000) }),
      baseOrder({ id: 3, order_no: "ORDBBBBBBBBBBBBBBB", client_order_id: "ORDBBBBBBBBBBBBBBB", user_id: 8, payment_account_id: 5 }),
    ],
    users: [
      user({}),
      user({ id: 8, name: "Merchant Eight", email: "m8@example.com", business_name: "Eight Store", api_key: "key_bbbb", sandbox_api_key: "test_key_bbbb" }),
      user({ id: 9, name: "Disabled", email: "d@example.com", is_active: false, api_key: "key_dddd", sandbox_api_key: "test_key_dddd" }),
    ],
    accounts: [
      { id: 3, user_id: 7, label: "Main UPI", provider: "manual", upi_id: "seven@okhdfc", payee_name: "Seven", is_active: true, is_default: true, daily_limit: null, created_at: iso(now - 86400 * 1000), credentials: null },
      { id: 4, user_id: 7, label: "Paytm PG", provider: "paytm_pg", upi_id: null, payee_name: null, is_active: true, is_default: false, daily_limit: null, created_at: iso(now - 86400 * 1000), credentials: encryptText(JSON.stringify({ mid: "MID123", merchant_key: "1234567890123456", website_name: "DEFAULT", environment: "sandbox" })) },
      { id: 5, user_id: 8, label: "Eight UPI", provider: "manual", upi_id: "eight@okhdfc", payee_name: "Eight", is_active: true, is_default: true, daily_limit: null, created_at: iso(now - 86400 * 1000), credentials: null },
    ],
    tokens: [],
    guards: [],
    rateBuckets: new Map(),
    queries: [],
    nextUserId: 100,
    nextTokenId: 1,
  };
}

function installFake(db: FakeDb, setSql: typeof __setSqlForTests = __setSqlForTests) {
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    db.queries.push(sqlText);
    const has = (s: string) => sqlText.includes(s);
    if (has("CREATE TABLE") || has("CREATE INDEX") || has("CREATE UNIQUE INDEX") || has("ALTER TABLE")) return [];
    // --- pay tokens ---
    if (has("DELETE FROM upi_pay_tokens")) {
      db.tokens = db.tokens.filter((t) => !(t.orderId === Number(values[0]) && t.usedAt === null));
      return [];
    }
    if (has("INSERT INTO upi_pay_tokens")) {
      // VALUES (order, 'utr', hash, exp), (order, 'start', hash, exp) — the
      // purposes are SQL literals, NOT interpolations: 6 values, not 8.
      const rows = [
        { orderId: Number(values[0]), purpose: "utr", hash: String(values[1]), expiresAt: new Date(String(values[2])).getTime() },
        { orderId: Number(values[3]), purpose: "start", hash: String(values[4]), expiresAt: new Date(String(values[5])).getTime() },
      ];
      for (const r of rows) db.tokens.push({ id: db.nextTokenId++, ...r, usedAt: null });
      return [];
    }
    if (has("UPDATE upi_pay_tokens SET used_at")) {
      const t = db.tokens.find((x) => x.orderId === Number(values[0]) && x.purpose === String(values[1]) && x.hash === String(values[2]) && x.usedAt === null && x.expiresAt > Date.now());
      if (!t) return [];
      t.usedAt = Date.now();
      return [{ id: t.id }];
    }
    if (has("FROM upi_pay_tokens")) {
      const t = db.tokens.find((x) => x.orderId === Number(values[0]) && x.purpose === String(values[1]) && x.hash === String(values[2]) && x.usedAt === null && x.expiresAt > Date.now());
      return t ? [{ id: t.id }] : [];
    }
    // --- UTR submit ---
    if (has("UPDATE orders SET status = 'review'")) {
      const o = db.orders.find((r) => r.id === Number(values[1]));
      if (!o || !["pending", "expired"].includes(o.status) || o.utr_attempts >= 3) return [];
      o.status = "review"; o.customer_utr = String(values[0]); o.utr_attempts += 1; o.utr_submitted_at = iso(Date.now());
      return [{ ...o }];
    }
    // --- checkout start budget ---
    if (has("UPDATE orders SET checkout_starts")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      if (!o || ((o as unknown as { checkout_starts?: number }).checkout_starts ?? 0) >= START_BUDGET_PER_ORDER) return [];
      (o as unknown as { checkout_starts: number }).checkout_starts = ((o as unknown as { checkout_starts?: number }).checkout_starts ?? 0) + 1;
      return [{ id: o.id }];
    }
    if (has("SELECT checkout_starts FROM orders")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      return [{ checkout_starts: (o as unknown as { checkout_starts?: number })?.checkout_starts ?? 0 }];
    }
    if (has("UPDATE orders SET provider_checkout")) {
      const o = db.orders.find((r) => r.id === Number(values[1] ?? values[0]));
      if (o) o.provider_checkout = JSON.parse(String(values[0])) as Record<string, unknown>;
      return [];
    }
    // --- outbox / notifications / audit ---
    if (has("UPDATE orders SET webhook_event_sequence")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      if (o) o.webhook_event_sequence += 1;
      return [{ webhook_event_sequence: o ? o.webhook_event_sequence : 1 }];
    }
    if (has("INSERT INTO webhook_outbox")) return [{ id: 1 }];
    if (has("INSERT INTO upi_notifications")) return [{ id: 99 }];
    if (has("INSERT INTO admin_audit_logs")) return [];
    if (has("UPDATE upi_amount_allocations SET status = 'released'")) return [];
    // --- order reads ---
    if (has("FROM orders WHERE order_no")) {
      const o = db.orders.find((r) => r.order_no === String(values[0]));
      return o ? [{ ...o, checkout_starts: (o as unknown as { checkout_starts?: number })?.checkout_starts ?? 0 }] : [];
    }
    if (has("SELECT id FROM orders WHERE user_id")) {
      // Values: [user_id, utr, utr, selfId]
      const [uid, utr, , self] = values as [number, string, string, number?];
      return db.orders.filter((r) => Number(r.user_id) === Number(uid) && (r.utr === utr || r.customer_utr === utr) && (self === undefined || r.id !== Number(self))).map((r) => ({ id: r.id }));
    }
    if (has("SELECT id FROM orders WHERE payment_account_id")) {
      return db.orders.filter((r) => Number(r.payment_account_id) === Number(values[0])).map((r) => ({ id: r.id }));
    }
    // --- accounts ---
    if (has("FROM payment_accounts WHERE id")) {
      const a = db.accounts.find((x) => x.id === Number(values[0]));
      return a ? [{ ...a }] : [];
    }
    // --- users ---
    if (has("FROM users WHERE id")) {
      const u = db.users.find((x) => x.id === Number(values[0]));
      return u ? [{ ...u }] : [];
    }
    if (has("FROM users WHERE LOWER(email)")) {
      const u = db.users.find((x) => String(x.email).toLowerCase() === String(values[0]).toLowerCase());
      return u ? [{ ...u }] : [];
    }
    if (has("FROM users WHERE role = 'admin'")) {
      return db.users.filter((x) => x.role === "admin").map((u) => ({ id: u.id }));
    }
    if (has("SELECT redirect_domains FROM users")) {
      const u = db.users.find((x) => x.id === Number(values[0]));
      return u ? [{ redirect_domains: u.redirect_domains }] : [];
    }
    if (has("SELECT user_id FROM installation_guards")) {
      return db.guards.map((g) => ({ user_id: g.user_id }));
    }
    if (has("INSERT INTO installation_guards")) {
      // VALUES ('primary_admin', id) — the name is a literal; only the id is bound.
      db.guards.push({ name: "primary_admin", user_id: Number(values[0]) });
      return [];
    }
    if (has("INSERT INTO users")) {
      // The role is a SQL literal ('admin' / 'merchant'), NOT a bound value —
      // detect it from the statement text. Setup values: [name, email, pw,
      // liveKey, encLive, sbKey, encSb, wh, sbWh]; register values: [name,
      // business, email, phone, pw, liveKey, encLive, sbKey, encSb, wh, sbWh].
      const isAdmin = sqlText.includes("'admin'");
      if (isAdmin && db.users.some((x) => x.role === "admin")) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "users_single_admin_idx"'), { code: "23505" });
      }
      const id = db.nextUserId++;
      if (isAdmin) {
        db.users.push({ id, name: String(values[0]), email: String(values[1]), password: String(values[2]), role: "admin", is_active: true, business_name: null, api_key: String(values[3]), sandbox_api_key: String(values[5]), redirect_domains: [] });
        return [{ id }];
      }
      db.users.push({ id, name: String(values[0]), email: String(values[2]), password: String(values[4]), role: "merchant", is_active: true, business_name: values[1] as string | null, api_key: String(values[5]), sandbox_api_key: String(values[7]), redirect_domains: [] });
      return [{ id, name: String(values[0]), email: String(values[2]), password: String(values[4]), role: "merchant" }];
    }
    // --- login attempts ---
    if (has("FROM upi_login_attempts")) return [];
    if (has("INSERT INTO upi_login_attempts")) return [];
    // --- rate limits (durable bucket: count per key) ---
    if (has("INSERT INTO upi_rate_limits")) {
      const key = String(values[0]);
      const n = (db.rateBuckets.get(key) ?? 0) + 1;
      db.rateBuckets.set(key, n);
      return [{ count: n }];
    }
    if (has("UPDATE orders SET provider_response")) return [];
    if (has("UPDATE orders SET verification_token")) return [];
    return [];
  };
  setSql(fn as never);
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
const paramsFor = (orderNo: string) => ({ params: Promise.resolve({ orderNo }) });
function clearUser() {
  (globalThis as unknown as { __mockSessionCookie?: string }).__mockSessionCookie = undefined;
}

afterEach(() => { __setSqlForTests(null); clearUser(); vi.unstubAllEnvs(); });
beforeEach(() => { clearUser(); });

async function seedTokens(db: FakeDb, orderId: number) {
  const sql = (db as FakeDb & { sql: unknown }).sql as never;
  const order = db.orders.find((o) => o.id === orderId)!;
  const tokens = await issuePayTokens(sql as never, order);
  if (!tokens) throw new Error("issuePayTokens returned null");
  return tokens;
}

describe("Group 12 — unauthenticated UTR submit (H1) is rejected, order unchanged", () => {
  it("no token → 401, order stays pending with 0 attempts", async () => {
    const db = installFake(buildDb(PW));
    const res = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "123456789012" }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", utr_attempts: 0, customer_utr: null });
    expect(db.queries.join(" ")).not.toContain("UPDATE orders SET status = 'review'");
  });
  it("a valid single-use token → 200 review; the SAME token again → 401 (single-use)", async () => {
    const db = installFake(buildDb(PW));
    const tokens = await seedTokens(db, 1);
    // NOTE: order 2 (same merchant) already holds 123456789012, so order 1
    // submits a different UTR — the clash check must not fire here.
    const first = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "111111111111", pay_token: tokens.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(first.status).toBe(200);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "review", utr_attempts: 1, customer_utr: "111111111111" });
    const again = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "111111111111", pay_token: tokens.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(again.status).toBe(401);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "review", utr_attempts: 1 });
  });
  it("an expired token → 401, order unchanged", async () => {
    const db = installFake(buildDb(PW));
    const tokens = await seedTokens(db, 1);
    const row = db.tokens.find((t) => t.purpose === "utr")!;
    row.expiresAt = Date.now() - 1000;
    const res = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "123456789012", pay_token: tokens.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", utr_attempts: 0 });
  });
  it("a token minted for ANOTHER order → 401, order unchanged", async () => {
    const db = installFake(buildDb(PW));
    const tokensB = await seedTokens(db, 3);
    const res = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "123456789012", pay_token: tokensB.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", utr_attempts: 0 });
  });
  it("a malformed UTR is 422 WITHOUT burning the token (validate before consume)", async () => {
    const db = installFake(buildDb(PW));
    const tokens = await seedTokens(db, 1);
    const bad = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "123", pay_token: tokens.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(bad.status).toBe(422);
    const good = await utrSubmit(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/utr", { utr: "111111111111", pay_token: tokens.utr }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(good.status).toBe(200);
  });
  it("G5: re-submitting the order's OWN UTR does not self-clash (lib-level)", async () => {
    const db = installFake(buildDb(PW));
    const dbOrder = db.orders.find((o) => o.id === 2)!; // review, customer_utr 123456789012
    dbOrder.status = "pending"; // re-opened for a fresh attempt; the UTR value is the same
    const out = await submitCustomerUtr({ ...dbOrder, utr_attempts: 1 }, "manual", "123456789012");
    expect(out.status).toBe("review");
    expect(out.customer_utr).toBe("123456789012");
  });
  it("a UTR already used on ANOTHER order of the same merchant → 422", async () => {
    const db = installFake(buildDb(PW));
    const orderA = db.orders.find((o) => o.id === 1)!; // fresh pending order
    // Order 2 (same merchant) already holds this customer_utr.
    await expect(submitCustomerUtr(orderA, "manual", "123456789012")).rejects.toMatchObject({ status: 422 });
    expect(db.orders.find((o) => o.id === 1)).toMatchObject({ status: "pending", utr_attempts: 0 });
  });
});

describe("Group 12 (cont.) — status is report-only without a token (H2)", () => {
  it("tokenless status → 200 stored status, NO provider check", async () => {
    const db = installFake(buildDb(PW));
    const res = await payStatus(getReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/status"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe("pending");
    expect(db.queries.join(" ")).not.toContain("FROM payment_accounts WHERE id");
    expect(db.queries.join(" ")).not.toContain("UPDATE orders SET verification_token");
  });
  it("status WITH a valid token may run the throttled check (account load happens)", async () => {
    const db = installFake(buildDb(PW));
    const tokens = await seedTokens(db, 1);
    const res = await payStatus(getReq(`http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/status?pay_token=${tokens.utr}`), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(200);
    expect(db.queries.join(" ")).toContain("FROM payment_accounts WHERE id");
  });
  it("enumeration: a tokenless poll of a foreign order reveals only its stored status (no provider check, no redirect); a nonexistent order is 404", async () => {
    // NOTE: existence on the PUBLIC pay surface is by design — the pay page
    // itself renders for any valid order_no. What the token design protects
    // is forcing provider verification and mutating the order. The
    // identical-404 rule applies to the MERCHANT-scoped reads (Group 1).
    const db = installFake(buildDb(PW));
    const foreign = await payStatus(getReq("http://localhost:3000/api/pay/ORDBBBBBBBBBBBBBBB/status"), paramsFor("ORDBBBBBBBBBBBBBBB"));
    expect(foreign.status).toBe(200);
    const body = await foreign.json() as { data: { status: string; redirect: unknown } };
    expect(body.data.status).toBe("pending");
    expect(body.data.redirect).toBeNull();
    expect(db.queries.join(" ")).not.toContain("FROM payment_accounts WHERE id");
    const missing = await payStatus(getReq("http://localhost:3000/api/pay/ORDDOESNOTEXISTAAA/status"), paramsFor("ORDDOESNOTEXISTAAA"));
    expect(missing.status).toBe(404);
  });
  it("return without a PG signal is rate-limited per order (H2): 3 forced checks, then none", async () => {
    const db = installFake(buildDb(PW));
    const countChecks = () => db.queries.filter((q) => q.includes("FROM payment_accounts WHERE id")).length;
    for (let i = 0; i < 3; i++) {
      const res = await payReturn(getReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/return"), paramsFor("ORDAAAAAAAAAAAAAAA"));
      expect(res.status).toBe(307);
    }
    expect(countChecks()).toBe(3);
    const fourth = await payReturn(getReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/return"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(fourth.status).toBe(307);
    expect(countChecks()).toBe(3); // budget spent: no 4th provider check
    expect(db.orders.find((o) => o.id === 1)?.status).toBe("pending");
  });
  it("return WITH a PG signal forces a check even after the budget is spent", async () => {
    const db = installFake(buildDb(PW));
    for (let i = 0; i < 3; i++) {
      await payReturn(getReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/return"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    }
    const res = await payReturn(getReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/return?CHECKSUMHASH=abc123"), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(307);
    expect(db.queries.filter((q) => q.includes("FROM payment_accounts WHERE id")).length).toBe(4);
  });
  it("hasPgReturnSignal detects Paytm / PhonePe return parameters", () => {
    expect(hasPgReturnSignal(new Request("http://localhost:3000/api/pay/ORDX/return?CHECKSUMHASH=abc"))).toBe(true);
    expect(hasPgReturnSignal(new Request("http://localhost:3000/api/pay/ORDX/return?transactionId=abc"))).toBe(true);
    expect(hasPgReturnSignal(new Request("http://localhost:3000/api/pay/ORDX/return"), "TXNID=123")).toBe(true);
    expect(hasPgReturnSignal(new Request("http://localhost:3000/api/pay/ORDX/return"))).toBe(false);
  });
  it("POST return consumes the body for signal detection without breaking the redirect", async () => {
    const db = installFake(buildDb(PW));
    const res = await payReturnPost(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/return", undefined, { "Content-Type": "application/x-www-form-urlencoded" }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(307);
    expect(db.orders.find((o) => o.id === 1)?.status).toBe("pending");
  });
});

describe("Group 12 (cont.) — hosted-checkout start budget (M1)", () => {
  it("no token → 401, provider_checkout untouched", async () => {
    const db = installFake(buildDb(PW));
    db.orders.find((o) => o.id === 1)!.payment_account_id = 4;
    const res = await payStart(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/start", {}), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(401);
    expect(db.orders.find((o) => o.id === 1)?.provider_checkout).toBeNull();
    expect(db.queries.join(" ")).not.toContain("UPDATE orders SET checkout_starts");
  });
  it("cached checkout reuses without consuming token or budget", async () => {
    const db = installFake(buildDb(PW));
    const cached = { type: "form", url: "https://securestage.paytmpayments.com/theia/api/v1/showPaymentPage?mid=MID123&orderId=ORDAAAAAAAAAAAAAAA", fields: { mid: "MID123", orderId: "ORDAAAAAAAAAAAAAAA", txnToken: "tok" }, expires_at: Math.floor(Date.now() / 1000) + 3600, account_id: 4, provider: "paytm_pg", environment: "sandbox" };
    const o = db.orders.find((x) => x.id === 1)!;
    o.payment_account_id = 4;
    o.provider_checkout = cached;
    const tokens = await seedTokens(db, 1);
    const first = await payStart(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/start", { pay_token: tokens.start }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { data: { checkout: unknown } };
    expect(firstBody.data.checkout).toEqual(cached);
    expect(db.queries.join(" ")).not.toContain("UPDATE upi_pay_tokens");
    expect(db.queries.join(" ")).not.toContain("UPDATE orders SET checkout_starts");
    // The same token still works (read-only verify, not consumed).
    const second = await payStart(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/start", { pay_token: tokens.start }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(second.status).toBe(200);
  });
  it("beyond the per-order budget → 429 with provider_checkout unchanged", async () => {
    const db = installFake(buildDb(PW));
    const o = db.orders.find((x) => x.id === 1)!;
    o.payment_account_id = 4;
    (o as unknown as { checkout_starts: number }).checkout_starts = 3;
    const tokens = await seedTokens(db, 1);
    const res = await payStart(postReq("http://localhost:3000/api/pay/ORDAAAAAAAAAAAAAAA/start", { pay_token: tokens.start }), paramsFor("ORDAAAAAAAAAAAAAAA"));
    expect(res.status).toBe(429);
    expect(db.orders.find((x) => x.id === 1)?.provider_checkout).toBeNull();
    expect(db.queries.join(" ")).not.toContain("UPDATE orders SET provider_checkout");
  });
  it("checkoutStartAllowed: 0–2 allowed, 3+ refused", () => {
    expect(checkoutStartAllowed(0)).toBe(true);
    expect(checkoutStartAllowed(2)).toBe(true);
    expect(checkoutStartAllowed(3)).toBe(false);
    expect(checkoutStartAllowed(9)).toBe(false);
  });
});

describe("Group 12 (cont.) — order_no entropy / non-sequential", () => {
  it("200 generated order numbers are all unique, well-formed and non-sequential", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = newOrderNo("live");
      expect(n).toMatch(/^ORD[A-Z0-9]{16}$/);
      seen.add(n);
    }
    expect(seen.size).toBe(200);
    const sandbox = newOrderNo("sandbox");
    expect(sandbox).toMatch(/^TST[A-Z0-9]{16}$/);
  });
});

describe("Pay-token unit semantics (lib/pay-token.ts)", () => {
  it("tokens are well-formed, unique and bound to order + purpose", () => {
    const t1 = newPayToken();
    const t2 = newPayToken();
    expect(isPayTokenFormat(t1)).toBe(true);
    expect(t1).not.toBe(t2);
    expect(isPayTokenFormat("pt_short")).toBe(false);
    expect(isPayTokenFormat("ORDABCDEFGHIJKLMN")).toBe(false);
    expect(isPayTokenFormat(null)).toBe(false);
  });
  it("MemoryPayTokenStore: verify → consume once → second consume fails; wrong order/purpose fail", () => {
    const store = new MemoryPayTokenStore();
    const tokens = store.issue(1, Date.now() + 15 * 60 * 1000);
    expect(store.verify(1, "utr", tokens.utr)).toBe(true);
    expect(store.verify(1, "start", tokens.utr)).toBe(false);
    expect(store.verify(2, "utr", tokens.utr)).toBe(false);
    expect(store.consume(1, "utr", tokens.utr)).toBe(true);
    expect(store.consume(1, "utr", tokens.utr)).toBe(false);
    expect(store.verify(1, "utr", tokens.utr)).toBe(false);
    expect(store.verify(1, "start", tokens.start)).toBe(true); // the other purpose is untouched
  });
  it("MemoryPayTokenStore: expired tokens never verify or consume", () => {
    const store = new MemoryPayTokenStore();
    const tokens = store.issue(1, Date.now() - 1000);
    expect(store.verify(1, "utr", tokens.utr)).toBe(false);
    expect(store.consume(1, "utr", tokens.utr)).toBe(false);
  });
  it("MemoryPayTokenStore: re-issue supersedes prior unused tokens", () => {
    const store = new MemoryPayTokenStore();
    const first = store.issue(1, Date.now() + 15 * 60 * 1000);
    expect(store.liveCount(1)).toBe(2);
    const second = store.issue(1, Date.now() + 15 * 60 * 1000);
    expect(store.liveCount(1)).toBe(2);
    expect(store.verify(1, "utr", first.utr)).toBe(false);
    expect(store.verify(1, "utr", second.utr)).toBe(true);
  });
  it("payTokenExpiryFor caps at 15 min and honours an earlier order expiry", () => {
    const cap = payTokenExpiryFor({ expires_at: iso(now + 60 * 60 * 1000) }, new Date(now));
    expect(cap.getTime() - now).toBe(15 * 60 * 1000);
    const early = payTokenExpiryFor({ expires_at: iso(now + 5 * 60 * 1000) }, new Date(now));
    expect(early.getTime() - now).toBe(5 * 60 * 1000);
    const expired = payTokenExpiryFor({ expires_at: iso(now - 60 * 1000) }, new Date(now));
    expect(expired.getTime() - now).toBe(15 * 60 * 1000); // grace window: still usable
  });
  it("DB issue/verify/consume round-trip (mocked sql)", async () => {
    const db = installFake(buildDb(PW));
    const sql = (db as FakeDb & { sql: unknown }).sql as never;
    const order = db.orders.find((o) => o.id === 1)!;
    const tokens = await issuePayTokens(sql as never, order);
    expect(tokens).not.toBeNull();
    expect(await verifyPayToken(sql as never, 1, "utr", tokens!.utr)).toBe(true);
    expect(await verifyPayToken(sql as never, 1, "start", tokens!.utr)).toBe(false);
    expect(await consumePayToken(sql as never, 1, "utr", tokens!.utr)).toBe(true);
    expect(await consumePayToken(sql as never, 1, "utr", tokens!.utr)).toBe(false);
    expect(await verifyPayToken(sql as never, 1, "start", tokens!.start)).toBe(true);
  });
  it("maskUtr shows only the last 4 digits", () => {
    expect(maskUtr("123456789012")).toBe("••••••••9012");
    expect(maskUtr(null)).toBeNull();
    expect(maskUtr(undefined)).toBeNull();
  });
});

describe("Group 14 — enumeration responses are identical", () => {
  it("L6: disabled account + correct password → same 401 as a wrong password / unknown email", async () => {
    const pwHash = await hashPassword("correct-horse");
    const db = installFake(buildDb(pwHash));
    const wrong = await login(postReq("http://localhost:3000/api/auth/login", { email: "m7@example.com", password: "wrong-password" }));
    const disabled = await login(postReq("http://localhost:3000/api/auth/login", { email: "d@example.com", password: "correct-horse" }));
    const unknown = await login(postReq("http://localhost:3000/api/auth/login", { email: "nope@example.com", password: "correct-horse" }));
    expect(wrong.status).toBe(401);
    expect(disabled.status).toBe(401);
    expect(unknown.status).toBe(401);
    const w = await wrong.text();
    const d = await disabled.text();
    const u = await unknown.text();
    expect(d).toBe(w);
    expect(u).toBe(w);
    expect(JSON.parse(w)).toEqual({ message: "These credentials do not match our records." });
    void db;
  });
  it("L7: existing email → 201 with the same top-level shape as a new registration, no user created", async () => {
    const db = buildDb(PW);
    vi.stubEnv("ALLOW_REGISTRATION", "true");
    vi.resetModules();
    const freshDb = await import("../lib/db");
    installFake(db, freshDb.__setSqlForTests);
    const { POST: freshRegister } = await import("../app/api/auth/register/route");
    const before = db.users.length;
    const res = await freshRegister(postReq("http://localhost:3000/api/auth/register", { name: "Merchant Seven", business_name: "Seven Store", email: "m7@example.com", phone: "9999999999", password: "correct-horse-1", password_confirmation: "correct-horse-1" }));
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { user: unknown; api_key: unknown; api_secret: unknown } };
    expect(Object.keys(body.data).sort()).toEqual(["api_key", "api_secret", "user"]);
    expect(body.data.api_key).toBeNull();
    expect(body.data.api_secret).toBeNull();
    expect(db.users.length).toBe(before);
    vi.unstubAllEnvs();
  });
  it("L7: a genuinely new email registers (201 with real keys, one user created)", async () => {
    const db = buildDb(PW);
    vi.stubEnv("ALLOW_REGISTRATION", "true");
    vi.resetModules();
    const freshDb = await import("../lib/db");
    installFake(db, freshDb.__setSqlForTests);
    const { POST: freshRegister } = await import("../app/api/auth/register/route");
    const res = await freshRegister(postReq("http://localhost:3000/api/auth/register", { name: "New Merchant", business_name: null, email: "new@example.com", phone: null, password: "correct-horse-1", password_confirmation: "correct-horse-1" }));
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { user: { email: string }; api_key: string; api_secret: string } };
    expect(body.data.user.email).toBe("new@example.com");
    expect(body.data.api_key.startsWith("key_")).toBe(true);
    expect(body.data.api_secret.startsWith("sec_")).toBe(true);
    expect(db.users.length).toBe(4);
    vi.unstubAllEnvs();
  });
  it("L8: GET /api/setup no longer leaks database_configured", async () => {
    installFake(buildDb(PW));
    const res = await setupGet();
    expect(res.status).toBe(200);
    const body = await res.json() as { data: Record<string, unknown> };
    expect(body.data).toEqual({ installed: false });
    expect("database_configured" in body.data).toBe(false);
  });
  it("L5: isInstalled is fail-closed when the guard row exists (even with no admin row)", async () => {
    const db = installFake(buildDb(PW));
    db.guards.push({ name: "primary_admin", user_id: 999 });
    expect(await isInstalled()).toBe(true);
    const db2 = installFake(buildDb(PW));
    expect(await isInstalled()).toBe(false);
    void db2;
  });
});

describe("Group 13 — setup double-POST creates exactly one admin", () => {
  const setupBody = { name: "First Admin", email: "admin@example.com", password: "correct-horse-1", password_confirmation: "correct-horse-1" };
  it("sequential double-POST: one 201, one 409, exactly one admin", async () => {
    const db = installFake(buildDb(PW));
    const first = await setupPost(postReq("http://localhost:3000/api/setup", setupBody));
    expect(first.status).toBe(201);
    const second = await setupPost(postReq("http://localhost:3000/api/setup", setupBody));
    expect(second.status).toBe(409);
    expect(db.users.filter((u) => u.role === "admin")).toHaveLength(1);
    expect(db.guards).toHaveLength(1);
  });
  it("concurrent double-POST: exactly one admin (unique index is the backstop)", async () => {
    const db = installFake(buildDb(PW));
    const [a, b] = await Promise.all([
      setupPost(postReq("http://localhost:3000/api/setup", setupBody)),
      setupPost(postReq("http://localhost:3000/api/setup", setupBody)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(db.users.filter((u) => u.role === "admin")).toHaveLength(1);
    expect(db.guards).toHaveLength(1);
  });
});

describe("G6 — Paytm PG response-signature verification", () => {
  const key = "1234567890123456";
  const order = {
    id: 1, order_no: "ORDAAAAAAAAAAAAAAA", amount: "100.00", payment_account_id: 3,
    original_expires_at: iso(now + 15 * 60 * 1000), expires_at: iso(now + 15 * 60 * 1000),
    created_at: iso(now - 60 * 1000),
  };
  const account = { id: 3, credentials: { mid: "MID123", merchant_key: key, environment: "sandbox" }, environment: "live" };
  const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  function signedBody() {
    return {
      resultInfo: { resultStatus: "TXN_SUCCESS" }, orderId: order.order_no,
      txnAmount: "100.00", currency: "INR", bankTxnId: "123456789012", txnId: "TXN1",
      txnDate: "2026-11-11 12:00:00",
    };
  }
  it("a correctly signed response verifies and pays", async () => {
    const body = signedBody();
    const sig = generatePaytmChecksum(JSON.stringify(body), key, "Ab12");
    const r = await checkPaytmPg(order, account, async () => jsonRes({ body, head: { signature: sig } }));
    expect(r.paid).toBe(true);
    expect((r.raw as Record<string, unknown>)._signatureVerified).toBe(true);
  });
  it("a TAMPERED response (bad signature) stays pending with code bad_signature", async () => {
    const body = signedBody();
    const sig = generatePaytmChecksum(JSON.stringify(body), key, "Ab12");
    const tampered = { ...body, txnAmount: "999.00" };
    const r = await checkPaytmPg(order, account, async () => jsonRes({ body: tampered, head: { signature: sig } }));
    expect(r.paid).toBe(false);
    expect(r.code).toBe("bad_signature");
  });
  it("an UNSIGNED response is accepted on its other bindings but flagged _signatureVerified: false", async () => {
    const body = signedBody();
    const r = await checkPaytmPg(order, account, async () => jsonRes({ body }));
    expect(r.paid).toBe(true);
    expect((r.raw as Record<string, unknown>)._signatureVerified).toBe(false);
  });
});

describe("G12 — provider responses are scrubbed before persisting/surfacing", () => {
  it("scrubProviderResponse strips secrets and keeps payment evidence", () => {
    const raw = {
      STATUS: "TXN_SUCCESS", ORDERID: "ORDAAAAAAAAAAAAAAA", TXNAMOUNT: "100.00",
      BANKTXNID: "123456789012", MID: "MID123", mid: "MID123",
      merchant_key: "secret-key", api_key: "key_x", client_secret: "csec",
      checksum: "abc", signature: "sig", access_token: "tok", txnToken: "ttok",
      nested: { signature: "sig2", amount: "100.00" },
    };
    const out = scrubProviderResponse(raw);
    expect(out.STATUS).toBe("TXN_SUCCESS");
    expect(out.TXNAMOUNT).toBe("100.00");
    expect(out.BANKTXNID).toBe("123456789012");
    expect(out.MID).toBe("[redacted]");
    expect(out.merchant_key).toBe("[redacted]");
    expect(out.api_key).toBe("[redacted]");
    expect(out.checksum).toBe("[redacted]");
    expect(out.signature).toBe("[redacted]");
    expect(out.access_token).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).signature).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).amount).toBe("100.00");
    expect(JSON.stringify(out)).not.toContain("secret-key");
  });
});
