// Round 10 (M1: pay-token:unauthenticated-mint:order-no-only) — payer secret.
// MOCKED (in-memory fake Neon clients via __setSqlForTests; no DB, no
// network, no DATABASE_URL).
// Covers: getPayData mints pay tokens ONLY when the render presents the
// payer secret (?k=) — without it, with a wrong one, or for a legacy
// NULL-secret order, and the sandbox exemption; toApiArray embeds ?k=
// only in merchant-facing serializations (never sandbox, never by
// default); createOrder mints a 32-hex secret at creation and still
// succeeds when the column is unavailable.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
// server-only is a Next.js build-time marker, not an installed package in
// this tree — stub it out so the server-data module can load under vitest.
vi.mock("server-only", () => ({}));
import { __setSqlForTests } from "../lib/db";
import { getPayData } from "../components/server-data";
import { toApiArray } from "../lib/orders/serialize";
import { createOrder } from "../lib/orders/create";
import {
  newPayerSecret, isValidPayerSecret, ensurePayerSecretColumn,
  __resetPayerSecretColumnEnsuredForTests,
} from "../lib/orders/payer-secret";
import {
  __resetAllocationTableEnsuredForTests,
} from "../lib/orders/allocations";
import { __resetNotificationsTableEnsuredForTests } from "../lib/notifications";
import type { OrderRow } from "../lib/orders/types";

process.env.SESSION_SECRET = "test-session-secret-32-chars!!";
process.env.ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const APP_URL = "http://localhost:3000";

/** Fixed 32-hex secret used as the order's stored payer_secret. */
const SECRET = "0123456789abcdef0123456789abcdef";
const WRONG_SECRET = "fedcba9876543210fedcba9876543210";

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDAAAAAAAAAAAAAAA", user_id: 7, payment_account_id: 3,
    client_order_id: "ORDAAAAAAAAAAAAAAA", amount: "100.00", status: "pending", environment: "live",
    customer_name: "A Customer", customer_email: null, customer_mobile: null, note: null, redirect_url: null,
    utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 0, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    payable_amount: "100.00", payer_secret: SECRET,
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

// ---------------------------------------------------------------- getPayData
interface PayFake {
  tokens: { orderId: number; purpose: string; hash: string; expiresAt: number; usedAt: number | null }[];
}

function installPayFake(order: OrderRow | null): PayFake {
  const db: PayFake = { tokens: [] };
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("CREATE TABLE") || text.includes("CREATE INDEX") || text.includes("ALTER TABLE")) return [];
    if (text.includes("DELETE FROM upi_pay_tokens")) {
      db.tokens = db.tokens.filter((t) => !(t.orderId === Number(values[0]) && t.usedAt === null));
      return [];
    }
    if (text.includes("INSERT INTO upi_pay_tokens")) {
      const rows = [
        { orderId: Number(values[0]), purpose: "utr", hash: String(values[1]), expiresAt: new Date(String(values[2])).getTime() },
        { orderId: Number(values[3]), purpose: "start", hash: String(values[4]), expiresAt: new Date(String(values[5])).getTime() },
      ];
      for (const r of rows) db.tokens.push({ ...r, usedAt: null });
      return [];
    }
    // redirect_domains MUST be checked before the generic users-by-id read:
    // both queries contain "FROM users WHERE id".
    if (text.includes("SELECT redirect_domains FROM users")) return [{ redirect_domains: [] }];
    if (text.includes("FROM users WHERE id")) return [{ name: "Merchant Seven", business_name: "Seven Store" }];
    if (text.includes("FROM orders WHERE order_no")) {
      return order && order.order_no === String(values[0]) ? [{ ...order }] : [];
    }
    if (text.includes("FROM payment_accounts WHERE id")) {
      return [{ id: 3, user_id: 7, label: "Main UPI", provider: "manual", upi_id: "seven@okhdfc", payee_name: "Seven", is_active: true, is_default: true, daily_limit: null, credentials: null }];
    }
    return [];
  };
  __setSqlForTests(fn as never);
  return db;
}

afterEach(() => { __setSqlForTests(null); });

describe("getPayData — payer-secret gate (Round 10 M1)", () => {
  it("(a) live order WITH a secret, no ?k= → payToken null (no unauthenticated mint)", async () => {
    const db = installPayFake(baseOrder());
    const data = await getPayData("ORDAAAAAAAAAAAAAAA");
    expect(data).not.toBeNull();
    expect(data!.payToken).toBeNull();
    expect(db.tokens).toHaveLength(0);
    // The pay page's `api` prop must never carry the secret.
    expect(String(data!.api.payment_url)).not.toContain("?k=");
    expect(String(data!.api.payment_url)).not.toContain(SECRET);
    expect(JSON.stringify(data!.api)).not.toContain(SECRET);
  });

  it("(b) live order WITH a secret, correct ?k= → payToken minted (utr+start, pt_ format)", async () => {
    const db = installPayFake(baseOrder());
    const data = await getPayData("ORDAAAAAAAAAAAAAAA", SECRET);
    expect(data).not.toBeNull();
    expect(data!.payToken).not.toBeNull();
    expect(data!.payToken!.utr).toMatch(/^pt_[0-9a-f]{32}$/);
    expect(data!.payToken!.start).toMatch(/^pt_[0-9a-f]{32}$/);
    expect(data!.payToken!.utr).not.toBe(data!.payToken!.start);
    expect(db.tokens).toHaveLength(2);
    // Still no secret in the api prop, even on the authorised render.
    expect(JSON.stringify(data!.api)).not.toContain(SECRET);
  });

  it("(c) live order WITH a secret, wrong ?k= → payToken null", async () => {
    const db = installPayFake(baseOrder());
    const data = await getPayData("ORDAAAAAAAAAAAAAAA", WRONG_SECRET);
    expect(data).not.toBeNull();
    expect(data!.payToken).toBeNull();
    expect(db.tokens).toHaveLength(0);
  });

  it("(d) legacy live order with NULL secret → tokens minted (documented migration behaviour)", async () => {
    const db = installPayFake(baseOrder({ payer_secret: null }));
    const data = await getPayData("ORDAAAAAAAAAAAAAAA");
    expect(data).not.toBeNull();
    expect(data!.payToken).not.toBeNull();
    expect(data!.payToken!.utr).toMatch(/^pt_[0-9a-f]{32}$/);
    expect(db.tokens).toHaveLength(2);
  });

  it("(e) sandbox order without ?k= → tokens minted (exempt, test-only, no real money)", async () => {
    const db = installPayFake(baseOrder({
      id: 9, order_no: "TSTAAAAAAAAAAAAAAA", client_order_id: "TSTAAAAAAAAAAAAAAA",
      environment: "sandbox", payment_account_id: null, payer_secret: SECRET,
    }));
    const data = await getPayData("TSTAAAAAAAAAAAAAAA");
    expect(data).not.toBeNull();
    expect(data!.payToken).not.toBeNull();
    expect(data!.payToken!.start).toMatch(/^pt_[0-9a-f]{32}$/);
    expect(db.tokens).toHaveLength(2);
  });

  it("paid orders get no token even with the correct ?k=", async () => {
    const db = installPayFake(baseOrder({ status: "paid" }));
    const data = await getPayData("ORDAAAAAAAAAAAAAAA", SECRET);
    expect(data).not.toBeNull();
    expect(data!.payToken).toBeNull();
    expect(db.tokens).toHaveLength(0);
  });

  it("unknown order → null", async () => {
    installPayFake(null);
    expect(await getPayData("ORDDOESNOTEXISTAAA")).toBeNull();
  });
});

describe("payer-secret helpers (lib/orders/payer-secret.ts)", () => {
  it("newPayerSecret is a fresh 32-hex string every time", () => {
    const a = newPayerSecret();
    const b = newPayerSecret();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it("isValidPayerSecret: exact match only, constant-time; rejects null/empty/malformed", () => {
    expect(isValidPayerSecret(SECRET, SECRET)).toBe(true);
    expect(isValidPayerSecret(WRONG_SECRET, SECRET)).toBe(false);
    expect(isValidPayerSecret(null, SECRET)).toBe(false);
    expect(isValidPayerSecret(undefined, SECRET)).toBe(false);
    expect(isValidPayerSecret(SECRET, null)).toBe(false);
    expect(isValidPayerSecret(SECRET, undefined)).toBe(false);
    expect(isValidPayerSecret("", "")).toBe(false);
    expect(isValidPayerSecret("not-hex", SECRET)).toBe(false);
    expect(isValidPayerSecret(SECRET.slice(0, 31), SECRET)).toBe(false);
    expect(isValidPayerSecret(SECRET.toUpperCase(), SECRET)).toBe(false);
  });

  it("ensurePayerSecretColumn returns true on a working DB and false (swallowed) when DDL fails", async () => {
    __resetPayerSecretColumnEnsuredForTests();
    const okSql = (async () => []) as never;
    expect(await ensurePayerSecretColumn(okSql)).toBe(true);
    __resetPayerSecretColumnEnsuredForTests();
    const badSql = (async () => { throw new Error("DDL boom"); }) as never;
    expect(await ensurePayerSecretColumn(badSql)).toBe(false);
    __resetPayerSecretColumnEnsuredForTests();
  });
});

describe("toApiArray — ?k= only in merchant-facing serializations (f)", () => {
  const account = { provider: "manual", upi_id: "seven@okhdfc", payee_name: "Seven" };
  it("includePayerSecret: true + secret set → payment_url contains ?k=<secret>", () => {
    const out = toApiArray(baseOrder(), account, APP_URL, { includePayerSecret: true });
    expect(out.payment_url).toBe(`${APP_URL}/pay/ORDAAAAAAAAAAAAAAA?k=${SECRET}`);
  });
  it("default (no opts) → payment_url has no ?k=", () => {
    const out = toApiArray(baseOrder(), account, APP_URL);
    expect(out.payment_url).toBe(`${APP_URL}/pay/ORDAAAAAAAAAAAAAAA`);
    expect(String(out.payment_url)).not.toContain("?k=");
  });
  it("includePayerSecret: false → no ?k=", () => {
    const out = toApiArray(baseOrder(), account, APP_URL, { includePayerSecret: false });
    expect(out.payment_url).toBe(`${APP_URL}/pay/ORDAAAAAAAAAAAAAAA`);
  });
  it("includePayerSecret: true but secret NULL → plain URL (no dangling ?k=)", () => {
    const out = toApiArray(baseOrder({ payer_secret: null }), account, APP_URL, { includePayerSecret: true });
    expect(out.payment_url).toBe(`${APP_URL}/pay/ORDAAAAAAAAAAAAAAA`);
  });
  it("sandbox + includePayerSecret: true → NEVER ?k= (sandbox pay URL only)", () => {
    const out = toApiArray(baseOrder({ environment: "sandbox", order_no: "TSTAAAAAAAAAAAAAAA" }), account, APP_URL, { includePayerSecret: true });
    expect(out.payment_url).toBe(`${APP_URL}/sandbox/pay/TSTAAAAAAAAAAAAAAA`);
    expect(String(out.payment_url)).not.toContain("?k=");
  });
});

// ---------------------------------------------------------------- createOrder
interface CreateFakeOrder {
  id: number; order_no: string; user_id: number; payment_account_id: number | null;
  client_order_id: string; amount: string; payable_amount: string | null;
  status: string; environment: string; payer_secret?: string | null;
}

class CreateFakeDb {
  orders: CreateFakeOrder[] = [];
  nextId = 1;
  alterThrows = false;
  queries: string[] = [];

  sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").trimStart();
    this.queries.push(text);
    if (text.startsWith("CREATE TABLE") || text.startsWith("CREATE UNIQUE INDEX") || text.startsWith("CREATE INDEX")) return [];
    if (text.startsWith("ALTER TABLE")) {
      if (this.alterThrows) throw new Error("column does not exist (simulated)");
      return [];
    }
    if (text.startsWith("SELECT rotation_mode FROM users")) return [{ rotation_mode: "random" }];
    if (text.startsWith("SELECT * FROM payment_accounts")) {
      return [{ id: 3, user_id: 7, provider: "manual", label: "Test UPI", upi_id: "shop@okaxis", payee_name: "Shop", credentials: null, is_active: true, is_default: true, daily_limit: null }];
    }
    if (text.startsWith("SELECT COALESCE(SUM(amount), 0) AS total FROM orders")) return [{ total: 0 }];
    if (text.startsWith("SELECT qr_method, qr_increment_paise FROM users")) return [];
    if (text.startsWith("INSERT INTO orders")) {
      const [orderNo, userId, paymentAccountId, clientOrderId, amount, payableAmount,
        environment, customerName, customerEmail, customerMobile, note,
        redirectUrl, expiresAt, originalExpiresAt] = values as [
        string, number, number | null, string, number, string | null, string,
        string | null, string | null, string | null, string | null, string | null,
        string, string];
      const row: CreateFakeOrder = {
        id: this.nextId++, order_no: orderNo, user_id: userId,
        payment_account_id: paymentAccountId, client_order_id: clientOrderId,
        amount: Number(amount).toFixed(2), payable_amount: payableAmount,
        status: "pending", environment, payer_secret: null,
      };
      void customerName; void customerEmail; void customerMobile; void note; void redirectUrl; void expiresAt; void originalExpiresAt;
      this.orders.push(row);
      return [row];
    }
    if (text.startsWith("UPDATE orders SET payer_secret")) {
      const [secret, orderId] = values as [string, number];
      const row = this.orders.find((o) => o.id === orderId && (o.payer_secret ?? null) === null);
      if (!row) return [];
      row.payer_secret = secret;
      return [{ payer_secret: secret }];
    }
    if (text.startsWith("INSERT INTO upi_notifications")) {
      return [{ id: this.nextId++, user_id: 7, order_id: 1, order_no: "x", type: "order_created", title: "t", body: "", amount: null, is_read: false, read_at: null, created_at: iso(now) }];
    }
    throw new Error(`unexpected SQL in create fake: ${text.slice(0, 120)}`);
  }) as never;
}

describe("createOrder mints a payer secret (g)", () => {
  let db: CreateFakeDb;
  beforeEach(() => {
    db = new CreateFakeDb();
    __setSqlForTests(db.sql);
    __resetPayerSecretColumnEnsuredForTests();
    __resetAllocationTableEnsuredForTests();
    __resetNotificationsTableEnsuredForTests();
  });

  it("live order (Normal QR) is created with a 32-hex payer_secret, persisted on the row", async () => {
    const order = await createOrder({ userId: 7, environment: "live", amount: 500, paymentAccountId: 3, qrMethod: "normal" });
    expect(order.payer_secret).toMatch(/^[0-9a-f]{32}$/);
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].payer_secret).toBe(order.payer_secret);
    expect(db.queries.join(" ")).toContain("UPDATE orders SET payer_secret");
  });

  it("sandbox order is created with a payer_secret too", async () => {
    const order = await createOrder({ userId: 7, environment: "sandbox", amount: 500 });
    expect(order.payer_secret).toMatch(/^[0-9a-f]{32}$/);
    expect(db.orders[0].payer_secret).toBe(order.payer_secret);
  });

  it("two orders get different secrets", async () => {
    const a = await createOrder({ userId: 7, environment: "sandbox", amount: 500 });
    const b = await createOrder({ userId: 7, environment: "sandbox", amount: 500 });
    expect(a.payer_secret).not.toBe(b.payer_secret);
  });

  it("column unavailable (ALTER fails) → creation still succeeds, secret stays null", async () => {
    db.alterThrows = true;
    const order = await createOrder({ userId: 7, environment: "sandbox", amount: 500 });
    expect(order.status).toBe("pending");
    expect(order.payer_secret ?? null).toBeNull();
    expect(db.orders).toHaveLength(1);
  });
});
