// Round 10 (M3) — mark-paid outbox retry + paid-event reconciler.
// MOCKED (in-memory fake Neon client via __setSqlForTests; no DB, no
// network, no DATABASE_URL). Fault-injection: the fake can throw on the
// webhook_outbox INSERT a set number of times, so the retry in
// markPaidInDb and the reconciler in lib/webhooks/outbox.ts can be proven
// without a live database.
import { describe, it, expect, afterEach } from "vitest";
import { __setSqlForTests, getSql } from "../lib/db";
import { markPaidInDb, validateVerificationEvidence } from "../lib/orders/mark-paid";
import { reconcileMissingPaidEvents } from "../lib/webhooks/outbox";
import type { OrderRow } from "../lib/orders/types";
import type { VerificationResult } from "../lib/verifiers/verification-result";

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDABCDEFGHIJKLMN", user_id: 7, payment_account_id: 3,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "100.00", status: "pending", environment: "live",
    customer_name: null, customer_email: null, customer_mobile: null, note: null, redirect_url: null,
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

const ctx = {
  accountProvider: "paytm_business", accountId: 3, accountEnvironment: "live",
  existingUtrUsed: async () => false,
};

function paidResult(order: OrderRow, over: Partial<VerificationResult> = {}): VerificationResult {
  return {
    paid: true, utr: "123456789012", txnId: "TXN1", raw: {}, provider: "paytm_business",
    orderId: 1, orderNumber: order.order_no, amount: "100.00", currency: "INR",
    verifiedAt: new Date(), paymentAccountId: 3, environment: "live",
    originalExpiresAt: new Date(order.original_expires_at!), occurredAt: new Date(), ...over,
  };
}

interface OutboxRow {
  id: number; event_id: string; order_id: number; sequence: number;
  transition_key: string; event: string; environment: string; status: string;
}

interface FakeDb {
  orders: OrderRow[];
  outbox: OutboxRow[];
  queries: string[];
  /** "none" | "fail-once" | "fail-always" — fault injection for the outbox INSERT. */
  outboxMode: "none" | "fail-once" | "fail-always";
  outboxInsertAttempts: number;
  nextOutboxId: number;
}

function buildDb(): FakeDb {
  return { orders: [baseOrder()], outbox: [], queries: [], outboxMode: "none", outboxInsertAttempts: 0, nextOutboxId: 1 };
}

function installFake(db: FakeDb) {
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    db.queries.push(sqlText);
    const has = (s: string) => sqlText.includes(s);
    if (has("CREATE TABLE") || has("CREATE INDEX") || has("CREATE UNIQUE INDEX") || has("ALTER TABLE")) return [];
    // --- reconciler sweep: paid orders with no 'paid:{id}' outbox row ---
    if (has("NOT EXISTS (SELECT 1 FROM webhook_outbox")) {
      const limit = Number(values[0] ?? 100);
      return db.orders
        .filter((o) => o.status === "paid" && !db.outbox.some((w) => w.transition_key === `paid:${o.id}`))
        .sort((a, b) => a.id - b.id)
        .slice(0, limit)
        .map((o) => ({ ...o }));
    }
    // --- paid transition (conditional UPDATE) ---
    if (has("UPDATE orders SET status = 'paid'")) {
      const o = db.orders.find((r) => r.id === Number(values[4]));
      if (!o || !["pending", "expired"].includes(o.status)) return [];
      o.status = "paid"; o.utr = String(values[0]); o.provider_txn_id = (values[1] as string | null) ?? null;
      o.paid_at = String(values[3]); o.verified_by = "provider";
      return [{ id: o.id }];
    }
    if (has("SELECT status FROM orders WHERE id")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      return o ? [{ status: o.status }] : [];
    }
    if (has("UPDATE upi_amount_allocations SET status = 'released'")) return [];
    // --- outbox sequence bump ---
    if (has("UPDATE orders SET webhook_event_sequence")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      if (o) o.webhook_event_sequence += 1;
      return [{ webhook_event_sequence: o ? o.webhook_event_sequence : 1 }];
    }
    // --- outbox INSERT (fault-injectable) ---
    if (has("INSERT INTO webhook_outbox")) {
      db.outboxInsertAttempts++;
      if (db.outboxMode === "fail-always") throw new Error("simulated outbox INSERT failure");
      if (db.outboxMode === "fail-once" && db.outboxInsertAttempts === 1) throw new Error("simulated outbox INSERT failure");
      const transitionKey = String(values[3]);
      if (db.outbox.some((w) => w.transition_key === transitionKey)) return []; // ON CONFLICT DO NOTHING
      const row: OutboxRow = {
        id: db.nextOutboxId++, event_id: String(values[0]), order_id: Number(values[1]),
        sequence: Number(values[2]), transition_key: transitionKey, event: String(values[4]),
        environment: String(values[5]), status: "pending",
      };
      db.outbox.push(row);
      return [{ ...row }];
    }
    if (has("FROM webhook_outbox WHERE transition_key")) {
      const w = db.outbox.find((x) => x.transition_key === String(values[0]));
      return w ? [{ ...w }] : [];
    }
    if (has("INSERT INTO upi_notifications")) return [{ id: 99 }];
    if (has("SELECT * FROM orders WHERE id")) {
      const o = db.orders.find((r) => r.id === Number(values[0]));
      return o ? [{ ...o }] : [];
    }
    return [];
  };
  __setSqlForTests(fn as never);
  return db;
}

afterEach(() => { __setSqlForTests(null); });

const paidEvents = (db: FakeDb) => db.outbox.filter((w) => w.event === "order.paid");

describe("Round 10 (M3) — markPaidInDb outbox retry", () => {
  it("(a) outbox INSERT throws once then succeeds -> returns 'paid' with exactly one order.paid event", async () => {
    const db = installFake(buildDb());
    db.outboxMode = "fail-once";
    const order = db.orders[0];
    expect(validateVerificationEvidence(order, paidResult(order), ctx)).toBeNull();
    const out = await markPaidInDb(order, paidResult(order), ctx);
    expect(out).toBe("paid");
    expect(db.orders[0].status).toBe("paid");
    expect(db.outboxInsertAttempts).toBe(2); // 1 failure + 1 retry success
    expect(paidEvents(db)).toHaveLength(1);
    expect(paidEvents(db)[0]).toMatchObject({ order_id: 1, transition_key: "paid:1", event: "order.paid" });
  });

  it("(b) outbox INSERT throws on every attempt -> still returns 'paid' (no throw after commit), 0 events; reconciler then inserts exactly one", async () => {
    const db = installFake(buildDb());
    db.outboxMode = "fail-always";
    const order = db.orders[0];
    const out = await markPaidInDb(order, paidResult(order), ctx);
    expect(out).toBe("paid");
    expect(db.orders[0].status).toBe("paid");
    expect(db.outboxInsertAttempts).toBe(3); // bounded: 3 attempts total
    expect(paidEvents(db)).toHaveLength(0);
    // Backstop: with the fault cleared, the reconciler recovers the event.
    db.outboxMode = "none";
    const reconciled = await reconcileMissingPaidEvents(getSql());
    expect(reconciled).toBe(1);
    expect(paidEvents(db)).toHaveLength(1);
    expect(paidEvents(db)[0]).toMatchObject({ order_id: 1, transition_key: "paid:1", event: "order.paid" });
  });

  it("(c) running the reconciler twice inserts exactly one event total (idempotent)", async () => {
    const db = installFake(buildDb());
    db.outboxMode = "fail-always";
    const order = db.orders[0];
    expect(await markPaidInDb(order, paidResult(order), ctx)).toBe("paid");
    expect(paidEvents(db)).toHaveLength(0);
    db.outboxMode = "none";
    const sql = getSql();
    expect(await reconcileMissingPaidEvents(sql)).toBe(1);
    expect(await reconcileMissingPaidEvents(sql)).toBe(0);
    expect(paidEvents(db)).toHaveLength(1);
  });

  it("(d) a paid order that already has its event is untouched by the reconciler (0 inserted)", async () => {
    const db = installFake(buildDb());
    const order = db.orders[0];
    expect(await markPaidInDb(order, paidResult(order), ctx)).toBe("paid");
    expect(paidEvents(db)).toHaveLength(1);
    const sql = getSql();
    expect(await reconcileMissingPaidEvents(sql)).toBe(0);
    expect(paidEvents(db)).toHaveLength(1);
    // No sequence bump for an already-covered order: the sweep never called recordOutboxEvent.
    expect(db.orders[0].webhook_event_sequence).toBe(1);
  });
});
