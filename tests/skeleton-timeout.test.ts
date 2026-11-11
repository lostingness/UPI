// Round 5 skeleton fix — a stalled database endpoint must fail fast instead
// of hanging the page on the loading.tsx skeleton forever.
// MOCKED (no DB, no network): the sql client is replaced with one whose
// queries never settle, simulating a hung Neon endpoint.
import { describe, it, expect, afterEach } from "vitest";
import { __setSqlForTests } from "../lib/db";
import { dashboardStats } from "../lib/dashboard";
import { loadOrderByNo, loadAccount } from "../lib/orders/check";

afterEach(() => { __setSqlForTests(null); });

// Never-settling sql client: every query hangs forever, like a stalled DB.
const hangingSql = (async () => new Promise<never>(() => {})) as unknown as Parameters<
  typeof __setSqlForTests
>[0];

// Fast sql client answering the three dashboardStats queries.
function dashboardSql() {
  const fn = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("paid_count")) {
      return [{ paid_count: "2", pending_count: "1", review_count: "0", closed_count: "3", total_amount: "1000.00", today_amount: "500.00", today_count: "1" }];
    }
    if (text.includes("GROUP BY day")) {
      return [{ day: new Date("2026-11-11T00:00:00Z"), amount: "500.00", count: "1" }];
    }
    return [];
  };
  return fn as unknown as Parameters<typeof __setSqlForTests>[0];
}

describe("skeleton timeouts (hung DB fails fast)", () => {
  it("dashboardStats rejects within ~8 s when the DB hangs", async () => {
    __setSqlForTests(hangingSql);
    const t0 = Date.now();
    await expect(dashboardStats(7, "live")).rejects.toThrow(/timed out/);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(7000);
    expect(elapsed).toBeLessThan(15000);
  }, 20000);

  it("loadOrderByNo rejects within ~8 s when the DB hangs", async () => {
    __setSqlForTests(hangingSql);
    const t0 = Date.now();
    await expect(loadOrderByNo("ORDABCDEFGHIJKLMN")).rejects.toThrow(/timed out/);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(7000);
    expect(elapsed).toBeLessThan(15000);
  }, 20000);

  it("loadAccount rejects within ~8 s when the DB hangs", async () => {
    __setSqlForTests(hangingSql);
    const t0 = Date.now();
    await expect(loadAccount(3)).rejects.toThrow(/timed out/);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(7000);
    expect(elapsed).toBeLessThan(15000);
  }, 20000);

  it("loadAccount(null) still returns null immediately without a query", async () => {
    __setSqlForTests(hangingSql);
    await expect(loadAccount(null)).resolves.toBeNull();
  });

  it("dashboardStats still resolves normally when the DB answers", async () => {
    __setSqlForTests(dashboardSql());
    const d = await dashboardStats(7, "live");
    expect(d.paidCount).toBe(2);
    expect(d.pendingCount).toBe(1);
    expect(d.todayAmount).toBe(500);
    expect(d.chart7d).toHaveLength(1);
    expect(d.chart7d[0].date).toBe("11 Nov");
    expect(d.recentOrders).toEqual([]);
  });
});
