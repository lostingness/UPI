// MOCKED (no DB, no network, no audio hardware).
// (a) Sound synth logic: note frequencies, chime/tick sequences, the
//     persisted toggle (fake storage), and the gesture gate — play
//     functions return false (silent no-op, never throw) before any
//     gesture / without Web Audio.
// (b) Notification copy + creation: buildNotification titles/bodies/
//     dedupe keys for all four event types, createNotification with a
//     fake sql client (INSERT ... RETURNING), the best-effort wrapper
//     never throwing on DB failure, list + mark-as-read behaviour.
import { describe, it, expect, beforeEach } from "vitest";
import {
  noteFrequency,
  SUCCESS_CHIME_NOTES,
  ORDER_CREATED_TICK_NOTES,
  isSoundEnabled,
  setSoundEnabled,
  playSuccessChime,
  playOrderCreatedTick,
  unlockAudio,
  __resetSoundStateForTests,
  SOUND_ENABLED_KEY,
} from "../lib/sounds";
import {
  buildNotification,
  formatInr,
  clearNotifications,
  createNotification,
  createNotificationSafe,
  listNotifications,
  markNotificationsRead,
  __resetNotificationsTableEnsuredForTests,
  type NotificationRow,
} from "../lib/notifications";
import type { Sql } from "../lib/db";
import type { OrderRow } from "../lib/orders/types";

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 7, order_no: "ORDABCDEFGHIJKLMN", user_id: 3, payment_account_id: 1,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "500.00", status: "pending", environment: "live",
    customer_name: null, customer_email: null, customer_mobile: null, note: null, redirect_url: null,
    utr: null, customer_utr: null, utr_submitted_at: null, utr_attempts: 1, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    payable_amount: "500.01", paid_at: null,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
}

function fakeStorage(): { store: Map<string, string> } & Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
}

/** Minimal fake Neon sql client: records template text, answers by keyword. */
function makeFakeSql(impl: (text: string) => unknown[] = () => []) {
  const calls: string[] = [];
  const fn = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    calls.push(text);
    return impl(text);
  };
  const sql = Object.assign(fn, {
    query: async (text: string, _params: unknown[]) => {
      calls.push(text);
      return impl(text);
    },
  });
  return { sql: sql as unknown as Sql, calls };
}

beforeEach(() => {
  __resetSoundStateForTests();
  __resetNotificationsTableEnsuredForTests();
});

describe("sound synth (pure logic, no audio hardware)", () => {
  it("A4 is 440 Hz and the chime notes ascend", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440, 6);
    expect(noteFrequency("E5")).toBeCloseTo(659.25, 1);
    expect(noteFrequency("C4")).toBeCloseTo(261.63, 1);
    expect(noteFrequency("Bb3")).toBeCloseTo(233.08, 1);
    expect(noteFrequency("C#4")).toBeCloseTo(277.18, 1);
    expect(noteFrequency("not-a-note")).toBeNull();
    expect(noteFrequency("H4")).toBeNull();
  });
  it("success chime is 3 ascending notes inside ~0.7 s", () => {
    expect(SUCCESS_CHIME_NOTES).toHaveLength(3);
    const freqs = SUCCESS_CHIME_NOTES.map((n) => noteFrequency(n.note)!);
    expect(freqs[0]).toBeLessThan(freqs[1]);
    expect(freqs[1]).toBeLessThan(freqs[2]);
    const end = Math.max(...SUCCESS_CHIME_NOTES.map((n) => n.at + n.dur));
    expect(end).toBeLessThan(1);
  });
  it("order-created tick is one short soft note", () => {
    expect(ORDER_CREATED_TICK_NOTES).toHaveLength(1);
    expect(ORDER_CREATED_TICK_NOTES[0].dur).toBeLessThanOrEqual(0.15);
  });
  it("sounds default ON and the toggle persists in storage", () => {
    const s = fakeStorage();
    expect(isSoundEnabled(s)).toBe(true);
    setSoundEnabled(false, s);
    expect(s.store.get(SOUND_ENABLED_KEY)).toBe("0");
    expect(isSoundEnabled(s)).toBe(false);
    setSoundEnabled(true, s);
    expect(isSoundEnabled(s)).toBe(true);
  });
  it("no storage → default ON, never throws", () => {
    expect(isSoundEnabled(null)).toBe(true);
    expect(() => setSoundEnabled(false, null)).not.toThrow();
  });
  it("gesture gate: no AudioContext here, so unlock + play are silent no-ops", () => {
    expect(unlockAudio()).toBe(false); // no window in node — never throws
    expect(playSuccessChime()).toBe(false);
    expect(playOrderCreatedTick()).toBe(false);
  });
});

describe("notification copy (pure, no DB)", () => {
  it("payment received uses the PAYABLE amount (unique QR), not the order amount", () => {
    const n = buildNotification("payment_received", baseOrder());
    expect(n.title).toContain("₹500.01");
    expect(n.title).not.toContain("₹500.00");
    expect(n.dedupeKey).toBe("payment_received:7");
    expect(n.body).toContain("ORDABCDEFGHIJKLMN");
  });
  it("UTR-review approval says the merchant approved it", () => {
    const n = buildNotification("payment_received", baseOrder(), { via: "utr_review" });
    expect(n.body).toMatch(/approved the UTR/);
    expect(n.dedupeKey).toBe("payment_received:7"); // same event, same dedupe
  });
  it("order created, UTR submitted and expired have distinct dedupe keys", () => {
    expect(buildNotification("order_created", baseOrder()).dedupeKey).toBe("order_created:7");
    expect(buildNotification("utr_submitted", baseOrder()).dedupeKey).toBe("utr_submitted:7:1");
    expect(buildNotification("utr_submitted", baseOrder({ utr_attempts: 2 })).dedupeKey).toBe("utr_submitted:7:2");
    expect(buildNotification("order_expired", baseOrder()).dedupeKey).toBe("order_expired:7");
  });
  it("UTR-submitted copy tells the merchant action is needed, and never claims paid", () => {
    const n = buildNotification("utr_submitted", baseOrder());
    expect(n.body).toMatch(/approve or reject/);
    expect(n.title).not.toMatch(/paid/i);
  });
  it("formatInr is en-IN with 2dp", () => {
    expect(formatInr(500)).toBe("₹500.00");
    expect(formatInr("500.01")).toBe("₹500.01");
    expect(formatInr(1234567.8)).toBe("₹12,34,567.80");
  });
});

describe("notification creation (fake sql client)", () => {
  it("createNotification inserts and returns the row", async () => {
    const row: NotificationRow = {
      id: 1, user_id: 3, order_id: 7, order_no: "ORDABCDEFGHIJKLMN",
      type: "payment_received", title: "Payment received ₹500.01", body: "x",
      amount: "500.01", is_read: false, read_at: null, created_at: new Date().toISOString(),
    };
    const { sql, calls } = makeFakeSql((text) =>
      text.includes("INSERT INTO upi_notifications") ? [row] : [],
    );
    const out = await createNotification(sql, {
      userId: 3, orderId: 7, orderNo: "ORDABCDEFGHIJKLMN",
      type: "payment_received", title: row.title, body: "x",
      amount: "500.01", dedupeKey: "payment_received:7",
    });
    expect(out?.id).toBe(1);
    expect(calls.some((c) => c.includes("CREATE TABLE IF NOT EXISTS upi_notifications"))).toBe(true);
    expect(calls.some((c) => c.includes("ON CONFLICT"))).toBe(true);
  });
  it("dedupe: a repeat insert returns the existing row instead of a duplicate", async () => {
    const existing: NotificationRow = {
      id: 9, user_id: 3, order_id: 7, order_no: "ORDABCDEFGHIJKLMN",
      type: "payment_received", title: "Payment received ₹500.01", body: "x",
      amount: "500.01", is_read: false, read_at: null, created_at: new Date().toISOString(),
    };
    const { sql } = makeFakeSql((text) =>
      text.includes("INSERT INTO upi_notifications")
        ? []
        : text.includes("FROM upi_notifications WHERE dedupe_key")
          ? [existing]
          : [],
    );
    const out = await createNotification(sql, {
      userId: 3, orderId: 7, orderNo: "ORDABCDEFGHIJKLMN",
      type: "payment_received", title: "Payment received ₹500.01",
      dedupeKey: "payment_received:7",
    });
    expect(out?.id).toBe(9);
  });
  it("createNotificationSafe never throws when the DB fails", async () => {
    const throwing = (async () => { throw new Error("boom"); }) as unknown as Sql;
    await expect(
      createNotificationSafe({ userId: 3, type: "order_expired", title: "x" }, throwing),
    ).resolves.toBeNull();
  });
  it("listNotifications returns rows + unread count", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const { sql } = makeFakeSql((text) =>
      text.includes("COUNT(*)") ? [{ count: 3 }] : rows,
    );
    const out = await listNotifications(sql, 3, { limit: 20 });
    expect(out.notifications).toHaveLength(2);
    expect(out.unreadCount).toBe(3);
  });
  it("markNotificationsRead validates ids and only embeds integers", async () => {
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }, { id: 2 }]);
    const n = await markNotificationsRead(sql, 3, { ids: [1, 2, -5, 1.5, Number.NaN] });
    expect(n).toBe(2);
    const update = calls.find((c) => c.includes("UPDATE upi_notifications"));
    expect(update).toContain("IN (1,2)");
    expect(update).not.toContain("-5");
    expect(update).not.toContain("1.5");
  });
  it("mark all read updates only the merchant's unread rows", async () => {
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }]);
    await markNotificationsRead(sql, 3, { all: true });
    const update = calls.find((c) => c.includes("UPDATE upi_notifications"));
    expect(update).toContain("is_read = false");
  });
});

describe("notification clear (Round 9a — delete, not just mark-read)", () => {
  it("clear all deletes only the merchant's rows", async () => {
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }, { id: 2 }]);
    const n = await clearNotifications(sql, 3, { all: true });
    expect(n).toBe(2);
    const del = calls.find((c) => c.includes("DELETE FROM upi_notifications"));
    expect(del).toContain("user_id = ");
    expect(del).not.toContain("is_read");
  });
  it("clear read deletes only rows already marked read", async () => {
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }]);
    const n = await clearNotifications(sql, 3, { readOnly: true });
    expect(n).toBe(1);
    const del = calls.find((c) => c.includes("DELETE FROM upi_notifications"));
    expect(del).toContain("is_read = true");
  });
  it("no flag deletes nothing and issues no DELETE", async () => {
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }]);
    const n = await clearNotifications(sql, 3, {});
    expect(n).toBe(0);
    expect(calls.some((c) => c.includes("DELETE FROM upi_notifications"))).toBe(false);
  });
  it("clearing is a delete, so a cleared row can never be listed again", async () => {
    // Regression test for the Round 9 (a) report: mark-as-read only flips
    // is_read and the list returns read rows too, so "cleared" items kept
    // reappearing after reload. The DELETE path is the only clear that
    // survives a reload — assert the SQL is a DELETE, not an UPDATE.
    const { sql, calls } = makeFakeSql(() => [{ id: 1 }]);
    await clearNotifications(sql, 3, { all: true });
    const del = calls.find((c) => c.includes("DELETE FROM upi_notifications"));
    expect(del).toMatch(/DELETE FROM upi_notifications/);
    expect(calls.some((c) => c.includes("UPDATE upi_notifications"))).toBe(false);
  });
});
