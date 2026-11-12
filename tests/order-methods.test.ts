// MOCKED (in-memory fake Neon sql client; no DB, no network).
// Round 7 Track 2 — per-order QR method + daily-limit race guard (G10).
//   - create with Unique → payable ₹500.01 (second concurrent order ₹500.02)
//   - create with Normal → payable exactly ₹500.00, no allocation row
//   - no method sent → merchant setting; merchant without a setting → the
//     new platform default, Unique
//   - per-order qr_method overrides the merchant setting both ways
//   - duplicate active allocation is never re-issued; expiry release frees
//     the same paise amount for reuse
//   - sandbox ignores qr_method (always the plain amount)
//   - method/amount are immutable after creation: no API accepts a change —
//     a re-create with the same client_order_id is a 409 and the original
//     order is untouched; payable_amount cannot be set by the client
//     (both create schemas strip it)
//   - G10: two concurrent creates that together exceed the daily limit →
//     exactly one succeeds and the account total stays within the limit
//     (the guard is a single conditional DELETE — see lib/orders/create.ts)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOrder } from "../lib/orders/create";
import {
  allocatePayableAmount, releaseAllocation, releaseExpiredAllocations,
  __resetAllocationTableEnsuredForTests,
} from "../lib/orders/allocations";
import { __resetNotificationsTableEnsuredForTests } from "../lib/notifications";
import { __setSqlForTests } from "../lib/db";
import {
  createOrderApiSchema, createOrderDashboardSchema, parseBody,
} from "../lib/validate";
import { ApiError } from "../lib/errors";

interface FakeOrder {
  id: number; order_no: string; user_id: number; payment_account_id: number | null;
  client_order_id: string; amount: string; payable_amount: string | null;
  status: string; environment: string; customer_name: string | null;
  customer_email: string | null; customer_mobile: string | null; note: string | null;
  redirect_url: string | null; expires_at: string; original_expires_at: string;
  paid_at: string | null; utr_attempts: number;
}

interface FakeAlloc {
  id: number; user_id: number; payment_account_id: number | null;
  order_id: number; order_no: string; base_amount: string; payable_amount: string;
  status: string; allocated_at: string; released_at: string | null; expires_at: string;
}

interface FakeAccount {
  id: number; user_id: number; provider: string; label: string; upi_id: string | null;
  payee_name: string | null; credentials: string | null; is_active: boolean;
  is_default: boolean; daily_limit: string | null;
}

/** IST calendar-day start (ms), same definition as usedToday in create.ts. */
function istDayStartMs(): number {
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  return Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - 5.5 * 3600 * 1000;
}

/** Fake Neon sql client. Each handler runs synchronously (no awaits inside),
 * so a single statement is atomic — the same guarantee the real single-
 * statement guards rely on. Mirrors the real guards: active-only allocation
 * uniqueness, paid-today + pending + review daily totals. */
class FakeDb {
  orders: FakeOrder[] = [];
  allocations: FakeAlloc[] = [];
  users = new Map<number, { qr_method: string; qr_increment_paise: number }>();
  accounts: FakeAccount[] = [];
  nextId = 1;

  private usedByAccount(accountId: number): number {
    const dayStart = istDayStartMs();
    return this.orders
      .filter((o) => o.payment_account_id === accountId &&
        ((o.status === "paid" && o.paid_at !== null && new Date(o.paid_at).getTime() >= dayStart) ||
          o.status === "pending" || o.status === "review"))
      .reduce((s, o) => s + Number(o.amount), 0);
  }

  sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").trimStart();
    if (text.startsWith("CREATE TABLE") || text.startsWith("CREATE UNIQUE INDEX") || text.startsWith("CREATE INDEX")) return [];
    if (text.startsWith("SELECT rotation_mode FROM users")) {
      return [{ rotation_mode: "random" }];
    }
    if (text.startsWith("SELECT * FROM payment_accounts")) {
      const userId = values[0] as number;
      return this.accounts.filter((a) => a.user_id === userId && a.is_active);
    }
    if (text.includes("GROUP BY payment_account_id")) {
      const userId = values[0] as number;
      const totals = new Map<number, number>();
      for (const o of this.orders) {
        if (o.user_id !== userId || o.payment_account_id === null || !this.countsTowardLimit(o)) continue;
        totals.set(o.payment_account_id, (totals.get(o.payment_account_id) ?? 0) + Number(o.amount));
      }
      return [...totals.entries()].map(([payment_account_id, total]) => ({ payment_account_id, total }));
    }
    if (text.startsWith("SELECT COALESCE(SUM(amount), 0) AS total FROM orders")) {
      return [{ total: this.usedByAccount(values[0] as number) }];
    }
    if (text.startsWith("SELECT qr_method, qr_increment_paise FROM users")) {
      const row = this.users.get(values[0] as number);
      return row ? [row] : [];
    }
    if (text.startsWith("INSERT INTO orders")) {
      const [orderNo, userId, paymentAccountId, clientOrderId, amount, payableAmount,
        _status, environment, customerName, customerEmail, customerMobile, note,
        redirectUrl, expiresAt, originalExpiresAt] = values as [
        string, number, number | null, string, number, string | null, string, string,
        string | null, string | null, string | null, string | null, string | null,
        string, string];
      const clash = this.orders.some((o) =>
        o.user_id === userId && o.environment === environment && o.client_order_id === clientOrderId);
      if (clash) {
        throw new Error('duplicate key value violates unique constraint "orders_user_environment_client_unique"');
      }
      const row: FakeOrder = {
        id: this.nextId++, order_no: orderNo, user_id: userId,
        payment_account_id: paymentAccountId, client_order_id: clientOrderId,
        amount: Number(amount).toFixed(2), payable_amount: payableAmount,
        status: "pending", environment, customer_name: customerName,
        customer_email: customerEmail, customer_mobile: customerMobile, note,
        redirect_url: redirectUrl, expires_at: expiresAt,
        original_expires_at: originalExpiresAt, paid_at: null, utr_attempts: 0,
      };
      this.orders.push(row);
      return [row];
    }
    if (text.startsWith("DELETE FROM orders WHERE id =")) {
      const orderId = values[0] as number;
      if (text.includes("SELECT COALESCE(SUM(amount), 0) FROM orders")) {
        // Round 7 G10 guard: single conditional DELETE — fires only while
        // the account total (incl. this order) is over the limit.
        const accountId = values[1] as number;
        const limit = values[2] as number;
        const over = this.usedByAccount(accountId) > limit;
        const idx = this.orders.findIndex((o) => o.id === orderId && o.status === "pending");
        if (over && idx >= 0) {
          const [gone] = this.orders.splice(idx, 1);
          return [{ id: gone.id }];
        }
        return [];
      }
      const idx = this.orders.findIndex((o) => o.id === orderId && o.status === "pending");
      if (idx >= 0) {
        const [gone] = this.orders.splice(idx, 1);
        return [{ id: gone.id }];
      }
      return [];
    }
    if (text.startsWith("UPDATE orders SET payable_amount")) {
      const [payableAmount, orderId] = values as [string, number];
      const row = this.orders.find((o) => o.id === orderId);
      if (row) row.payable_amount = payableAmount;
      return row ? [row] : [];
    }
    if (text.startsWith("INSERT INTO upi_amount_allocations")) {
      const [userId, paymentAccountId, orderId, orderNo, base, payable, expiresAt] =
        values as [number, number | null, number, string, string, string, string];
      const clash = this.allocations.some((a) =>
        a.status === "active" && a.user_id === userId &&
        (a.payment_account_id ?? -1) === (paymentAccountId ?? -1) && a.payable_amount === payable);
      if (clash) return [];
      const row: FakeAlloc = {
        id: this.nextId++, user_id: userId, payment_account_id: paymentAccountId,
        order_id: orderId, order_no: orderNo, base_amount: base, payable_amount: payable,
        status: "active", allocated_at: new Date().toISOString(), released_at: null,
        expires_at: expiresAt,
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
    if (text.startsWith("INSERT INTO upi_notifications")) {
      return [{ id: this.nextId++ }];
    }
    throw new Error(`unexpected SQL in fake: ${text.slice(0, 120)}`);
  }) as never;

  private countsTowardLimit(o: FakeOrder): boolean {
    if (o.status === "pending" || o.status === "review") return true;
    if (o.status === "paid" && o.paid_at !== null) {
      return new Date(o.paid_at).getTime() >= istDayStartMs();
    }
    return false;
  }

  seedAccount(over: Partial<FakeAccount> = {}): FakeAccount {
    const a: FakeAccount = {
      id: 3, user_id: 7, provider: "manual", label: "Test UPI", upi_id: "shop@okaxis",
      payee_name: "Shop", credentials: null, is_active: true, is_default: true,
      daily_limit: null, ...over,
    };
    this.accounts.push(a);
    return a;
  }

  seedOrder(over: Partial<FakeOrder> = {}): FakeOrder {
    const row: FakeOrder = {
      id: this.nextId++, order_no: `ORDSEED${this.nextId}`, user_id: 7,
      payment_account_id: 3, client_order_id: `SEED${this.nextId}`,
      amount: "500.00", payable_amount: "500.00", status: "pending",
      environment: "live", customer_name: null, customer_email: null,
      customer_mobile: null, note: null, redirect_url: null,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      paid_at: null, utr_attempts: 0, ...over,
    };
    this.orders.push(row);
    return row;
  }

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
beforeEach(() => {
  db = new FakeDb();
  db.seedAccount();
  __setSqlForTests(db.sql);
  __resetAllocationTableEnsuredForTests();
  __resetNotificationsTableEnsuredForTests();
});
afterEach(() => { __setSqlForTests(null); });

const EXP = new Date(Date.now() + 15 * 60 * 1000).toISOString();
const liveOrder = (over: Record<string, unknown> = {}) => createOrder({
  userId: 7, environment: "live", amount: 500, paymentAccountId: 3, ...over,
});

describe("per-order QR method (Round 7)", () => {
  it("create with Unique → payable ₹500.01", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    const order = await liveOrder({ qrMethod: "unique" });
    expect(order.payable_amount).toBe("500.01");
    expect(order.amount).toBe("500.00");
    expect(order.status).toBe("pending");
    expect(db.allocations).toHaveLength(1);
    expect(db.allocations[0].payable_amount).toBe("500.01");
  });

  it("second concurrent order → ₹500.02 (distinct paise, no duplicate)", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    const [a, b] = await Promise.all([
      liveOrder({ qrMethod: "unique" }),
      liveOrder({ qrMethod: "unique" }),
    ]);
    expect([a.payable_amount, b.payable_amount].sort()).toEqual(["500.01", "500.02"]);
    expect(new Set(db.allocations.map((x) => x.payable_amount)).size).toBe(2);
  });

  it("create with Normal → payable exactly ₹500.00 and no allocation row", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    const order = await liveOrder({ qrMethod: "normal" });
    expect(order.payable_amount).toBe("500.00");
    expect(order.amount).toBe("500.00");
    expect(db.allocations).toHaveLength(0);
  });

  it("default (no method sent) → Unique: the new platform default", async () => {
    // Merchant 7 has NO stored setting here, so getMerchantQrSettings falls
    // back to the env default — which Round 7 flipped from same → unique.
    const order = await liveOrder({});
    expect(order.payable_amount).toBe("500.01");
  });

  it("default (no method sent) → merchant setting Normal is honoured", async () => {
    db.users.set(7, { qr_method: "same", qr_increment_paise: 1 });
    const order = await liveOrder({});
    expect(order.payable_amount).toBe("500.00");
    expect(db.allocations).toHaveLength(0);
  });

  it("per-order override beats the merchant setting both ways", async () => {
    db.users.set(7, { qr_method: "same", qr_increment_paise: 1 });
    expect((await liveOrder({ qrMethod: "unique" })).payable_amount).toBe("500.01");
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    expect((await liveOrder({ qrMethod: "normal" })).payable_amount).toBe("500.00");
  });

  it("a duplicate active allocation is never re-issued", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    db.seedActive(7, 900, "ORD900", "500.01");
    const order = await liveOrder({ qrMethod: "unique" });
    expect(order.payable_amount).toBe("500.02");
    expect(db.allocations.filter((a) => a.payable_amount === "500.01" && a.status === "active")).toHaveLength(1);
  });

  it("expiry release → the same paise amount can be allocated again", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    const first = await liveOrder({ qrMethod: "unique" });
    expect(first.payable_amount).toBe("500.01");
    expect(await releaseAllocation(db.sql, first.id, "expired")).toBe(true);
    const second = await liveOrder({ qrMethod: "unique" });
    expect(second.payable_amount).toBe("500.01");
  });

  it("releaseExpiredAllocations frees a past-expiry allocation for reuse", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    db.seedActive(7, 901, "ORD901", "500.01", "500.00", new Date(Date.now() - 1000).toISOString());
    expect(await releaseExpiredAllocations(db.sql)).toBe(1);
    const order = await liveOrder({ qrMethod: "unique" });
    expect(order.payable_amount).toBe("500.01");
  });

  it("sandbox ignores qr_method — always the plain amount", async () => {
    const order = await createOrder({ userId: 7, environment: "sandbox", amount: 500, qrMethod: "unique" });
    expect(order.payable_amount).toBe("500.00");
    expect(db.allocations).toHaveLength(0);
  });
});

describe("order-create API schema (qr_method)", () => {
  it("API schema accepts unique|normal, absent stays undefined", () => {
    const withUnique = parseBody(createOrderApiSchema, { amount: 500, client_order_id: "X1", qr_method: "unique" });
    expect(withUnique.qr_method).toBe("unique");
    const withNormal = parseBody(createOrderApiSchema, { amount: 500, client_order_id: "X2", qr_method: "normal" });
    expect(withNormal.qr_method).toBe("normal");
    const absent = parseBody(createOrderApiSchema, { amount: 500, client_order_id: "X3" });
    expect(absent.qr_method).toBeUndefined();
  });

  it("API schema rejects 'same' and anything else with 422", () => {
    for (const bad of ["same", "foo", 1]) {
      let err: unknown;
      try { parseBody(createOrderApiSchema, { amount: 500, client_order_id: "X1", qr_method: bad }); } catch (e) { err = e; }
      expect((err as ApiError)?.status).toBe(422);
    }
  });

  it("dashboard schema accepts unique|normal and rejects 'same'", () => {
    expect(parseBody(createOrderDashboardSchema, { amount: 500, qr_method: "normal" }).qr_method).toBe("normal");
    let err: unknown;
    try { parseBody(createOrderDashboardSchema, { amount: 500, qr_method: "same" }); } catch (e) { err = e; }
    expect((err as ApiError)?.status).toBe(422);
  });

  it("payable_amount cannot be set by the client — both schemas strip it", () => {
    const api = parseBody(createOrderApiSchema, { amount: 500, client_order_id: "X1", payable_amount: "1.00" });
    expect(api).not.toHaveProperty("payable_amount");
    const dash = parseBody(createOrderDashboardSchema, { amount: 500, payable_amount: "1.00" });
    expect(dash).not.toHaveProperty("payable_amount");
  });
});

describe("method/amount immutable after creation", () => {
  it("re-create with the same client_order_id → 409 and the original is untouched", async () => {
    db.users.set(7, { qr_method: "unique", qr_increment_paise: 1 });
    const first = await createOrder({
      userId: 7, environment: "live", amount: 500, clientOrderId: "C1",
      paymentAccountId: 3, qrMethod: "unique",
    });
    expect(first.payable_amount).toBe("500.01");
    // Same client_order_id, different amount AND different method: must not
    // overwrite the original order — it is a duplicate, not an edit.
    await expect(createOrder({
      userId: 7, environment: "live", amount: 999, clientOrderId: "C1",
      paymentAccountId: 3, qrMethod: "normal",
    })).rejects.toMatchObject({ status: 409 });
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].amount).toBe("500.00");
    expect(db.orders[0].payable_amount).toBe("500.01");
  });
  // NOTE (verified by grep, not by a test — there is no update endpoint to
  // call): no PATCH/PUT order route exists under app/api/orders or
  // app/api/v1/orders, and every `UPDATE orders SET` in lib/ is a status
  // transition (mark-paid / expire / UTR review / admin override /
  // verification) or the creation-time payable_amount write in
  // lib/orders/create.ts. No API accepts an amount/method change after
  // creation.
});

describe("daily-limit race guard (G10)", () => {
  it("two concurrent ₹600 creates on a ₹1000/day account → exactly one succeeds", async () => {
    db.accounts[0].daily_limit = "1000";
    const results = await Promise.allSettled([
      liveOrder({ amount: 600, qrMethod: "normal" }),
      liveOrder({ amount: 600, qrMethod: "normal" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 422 });
    // Exactly one order survives and the account total stays within limit.
    expect(db.orders).toHaveLength(1);
    expect(db.orders.reduce((s, o) => s + Number(o.amount), 0)).toBeLessThanOrEqual(1000);
  });

  it("create already over the pre-check limit → 422, no order left behind", async () => {
    db.accounts[0].daily_limit = "1000";
    db.seedOrder({ amount: "900.00" });
    await expect(liveOrder({ amount: 600, qrMethod: "normal" })).rejects.toMatchObject({ status: 422 });
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].amount).toBe("900.00");
  });

  it("create at exactly the limit passes", async () => {
    db.accounts[0].daily_limit = "1000";
    db.seedOrder({ amount: "400.00" });
    const order = await liveOrder({ amount: 600, qrMethod: "normal" });
    expect(order.status).toBe("pending");
    expect(db.orders).toHaveLength(2);
  });
});
