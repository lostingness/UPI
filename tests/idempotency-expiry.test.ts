// Round 10 — Medium #4: idempotency TTL must be enforced on the READ path.
// MOCKED (in-memory store + fake Neon client via __setSqlForTests; no DB,
// no network, no DATABASE_URL). Covers: expired completed / in-progress
// records are reclaimable (not replayed, not stuck in-progress) in both
// stores, unexpired behaviour is unchanged, and checkIdempotency treats
// an expired key as absent.
import { describe, it, expect, afterEach, vi } from "vitest";
import { __setSqlForTests } from "../lib/db";
import {
  MemoryIdempotencyStore, DbIdempotencyStore, claimOrReplay, checkIdempotency,
  storeIdempotentResponse, IDEMPOTENCY_IN_PROGRESS, IDEMPOTENCY_TTL_MS, payloadHash,
} from "../lib/idempotency";

afterEach(() => { __setSqlForTests(null); vi.useRealTimers(); });

const HOUR = 3600 * 1000;
const isoAt = (ms: number) => new Date(ms).toISOString();

// --- Memory store -----------------------------------------------------------

describe("memory store: expiry", () => {
  it("(a) completed entry expired after +25h replays nothing: claimOrReplay claims it, fresh put works", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100 };
    expect(await claimOrReplay(store, "10:exp-1", payload, 10)).toEqual({ kind: "claimed" });
    await storeIdempotentResponse(store, "10:exp-1", payload, 201, { order: "OLD" });
    expect(await claimOrReplay(store, "10:exp-1", payload, 10)).toEqual({ kind: "replay", status: 201, body: { order: "OLD" } });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 25 * HOUR));
      expect(await store.get("10:exp-1")).toBeNull();
      // Expired key is free: a new request claims it instead of replaying the old 201.
      expect(await claimOrReplay(store, "10:exp-1", payload, 10)).toEqual({ kind: "claimed" });
      await storeIdempotentResponse(store, "10:exp-1", payload, 201, { order: "NEW" });
      expect(await claimOrReplay(store, "10:exp-1", payload, 10)).toEqual({ kind: "replay", status: 201, body: { order: "NEW" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("(a) an already-expired injected record is a miss for get/claimOrReplay/checkIdempotency", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100 };
    await store.put({
      key: "10:exp-2", payloadHash: payloadHash(payload), responseStatus: 201,
      responseBody: JSON.stringify({ order: "OLD" }), expiresAt: isoAt(Date.now() - 1000),
    });
    expect(await store.get("10:exp-2")).toBeNull();
    expect(await checkIdempotency(store, "10:exp-2", payload)).toBeNull();
    expect(await claimOrReplay(store, "10:exp-2", payload, 10)).toEqual({ kind: "claimed" });
  });

  it("(b) expired in-progress claim is reclaimable, not stuck in-progress", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100 };
    expect(await claimOrReplay(store, "10:exp-3", payload, 10)).toEqual({ kind: "claimed" });
    expect(await claimOrReplay(store, "10:exp-3", payload, 10)).toEqual({ kind: "in-progress" });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 25 * HOUR));
      expect(await claimOrReplay(store, "10:exp-3", payload, 10)).toEqual({ kind: "claimed" });
    } finally {
      vi.useRealTimers();
    }
    // Same via an injected already-expired in-progress record.
    const store2 = new MemoryIdempotencyStore();
    await store2.put({
      key: "10:exp-4", payloadHash: payloadHash(payload), responseStatus: IDEMPOTENCY_IN_PROGRESS,
      responseBody: "", expiresAt: isoAt(Date.now() - 1000),
    });
    expect(await claimOrReplay(store2, "10:exp-4", payload, 10)).toEqual({ kind: "claimed" });
  });

  it("(c) no regression: unexpired completed replays, unexpired in-progress stays in-progress", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100 };
    expect(await claimOrReplay(store, "10:live-1", payload, 10)).toEqual({ kind: "claimed" });
    expect(await claimOrReplay(store, "10:live-1", payload, 10)).toEqual({ kind: "in-progress" });
    expect(await checkIdempotency(store, "10:live-1", payload)).toBeNull();
    await storeIdempotentResponse(store, "10:live-1", payload, 201, { ok: true });
    expect(await claimOrReplay(store, "10:live-1", payload, 10)).toEqual({ kind: "replay", status: 201, body: { ok: true } });
    expect(await checkIdempotency(store, "10:live-1", payload)).toEqual({ status: 201, body: { ok: true } });
  });

  it("claims stamp a ~24h expiry (IDEMPOTENCY_TTL_MS)", async () => {
    expect(IDEMPOTENCY_TTL_MS).toBe(24 * 3600 * 1000);
    const store = new MemoryIdempotencyStore();
    const before = Date.now();
    await store.claim({ key: "10:ttl-1", payloadHash: "x", responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" });
    const rec = await store.get("10:ttl-1");
    expect(rec?.expiresAt).toBeDefined();
    const exp = Date.parse(rec!.expiresAt!);
    expect(exp - before).toBeGreaterThanOrEqual(IDEMPOTENCY_TTL_MS - 1000);
    expect(exp - before).toBeLessThanOrEqual(IDEMPOTENCY_TTL_MS + 1000);
    // A second claim while unexpired still loses.
    expect(await store.claim({ key: "10:ttl-1", payloadHash: "x", responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" })).toBe(false);
  });

  it("an expired key reused with a DIFFERENT payload is not a 409", async () => {
    const store = new MemoryIdempotencyStore();
    await store.put({
      key: "10:exp-5", payloadHash: payloadHash({ amount: 100 }), responseStatus: 201,
      responseBody: JSON.stringify({ ok: true }), expiresAt: isoAt(Date.now() - 1000),
    });
    expect(await checkIdempotency(store, "10:exp-5", { amount: 200 })).toBeNull();
    expect(await claimOrReplay(store, "10:exp-5", { amount: 200 }, 10)).toEqual({ kind: "claimed" });
  });
});

// --- DB store (fake Neon seam) ----------------------------------------------

interface FakeIdemRow {
  key: string; payloadHash: string; responseStatus: number; responseBody: string;
  expiresAt: number | null; // epoch ms; null = legacy row with no expiry
}

function installFakeIdem(seed: FakeIdemRow[] = []) {
  const rows: FakeIdemRow[] = [...seed];
  const queries: string[] = [];
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    queries.push(sqlText);
    const has = (s: string) => sqlText.includes(s);
    if (has("ALTER TABLE")) return [];
    // claim() pre-delete of the expired row for the key (checked before the
    // SELECT branch: DELETE text also contains "FROM upi_idempotency_keys").
    if (has("DELETE FROM upi_idempotency_keys")) {
      const idx = rows.findIndex((r) => r.key === String(values[0]) && r.expiresAt !== null && r.expiresAt < Date.now());
      if (idx >= 0) { const [gone] = rows.splice(idx, 1); return [{ key: gone.key }]; }
      return [];
    }
    if (has("FROM upi_idempotency_keys")) {
      const r = rows.find((x) => x.key === String(values[0]));
      if (!r) return [];
      // Simulate the SQL-side expiry filter in get(): an expired row is a miss.
      if (r.expiresAt !== null && r.expiresAt <= Date.now()) return [];
      return [{
        key: r.key, payloadHash: r.payloadHash, responseStatus: r.responseStatus,
        responseBody: r.responseBody, expiresAt: r.expiresAt === null ? null : isoAt(r.expiresAt),
      }];
    }
    if (has("INSERT INTO upi_idempotency_keys")) {
      const [key, ph, rs, rb] = values as [string, string, number, string];
      const existing = rows.find((x) => x.key === key);
      if (sqlText.includes("DO NOTHING")) {
        if (existing) return [];
        rows.push({ key, payloadHash: ph, responseStatus: rs, responseBody: rb, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
        return [{ key }];
      }
      // put(): ON CONFLICT DO UPDATE — overwrites an expired row too.
      if (existing) Object.assign(existing, { payloadHash: ph, responseStatus: rs, responseBody: rb, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
      else rows.push({ key, payloadHash: ph, responseStatus: rs, responseBody: rb, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
      return [{ key }];
    }
    return [];
  };
  __setSqlForTests(fn as never);
  return { rows, queries };
}

describe("db store: expiry (fake Neon)", () => {
  const payload = { amount: 100 };
  const completed = (key: string, expiresAt: number | null): FakeIdemRow => ({
    key, payloadHash: payloadHash(payload), responseStatus: 201,
    responseBody: JSON.stringify({ order: "OLD" }), expiresAt,
  });

  it("(d) get() returns null for an expired row and the row when unexpired", async () => {
    const { queries } = installFakeIdem([
      completed("10:db-exp-1", Date.now() - 1000),
      completed("10:db-live-1", Date.now() + HOUR),
      completed("10:db-null-1", null), // legacy row: no expiry still replays
    ]);
    const store = new DbIdempotencyStore();
    expect(await store.get("10:db-exp-1")).toBeNull();
    const live = await store.get("10:db-live-1");
    expect(live?.responseStatus).toBe(201);
    expect(live?.expiresAt).toBeDefined();
    expect(await store.get("10:db-null-1")).not.toBeNull();
    expect(await store.get("10:db-missing")).toBeNull();
    // The expiry filter is in the SQL itself, not only in the fake.
    expect(queries.join(" ")).toContain("expires_at > NOW()");
  });

  it("(d) claim() over an expired row succeeds (expired row cleared first); over a live row it fails", async () => {
    const { rows, queries } = installFakeIdem([
      completed("10:db-exp-2", Date.now() - 1000),
      completed("10:db-live-2", Date.now() + HOUR),
    ]);
    const store = new DbIdempotencyStore();
    expect(await store.claim({ key: "10:db-exp-2", payloadHash: payloadHash(payload), responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" })).toBe(true);
    expect(rows.filter((r) => r.key === "10:db-exp-2")).toHaveLength(1);
    expect(rows.find((r) => r.key === "10:db-exp-2")?.responseStatus).toBe(IDEMPOTENCY_IN_PROGRESS);
    expect(await store.claim({ key: "10:db-live-2", payloadHash: payloadHash(payload), responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" })).toBe(false);
    expect(queries.join(" ")).toContain("DELETE FROM upi_idempotency_keys");
    expect(queries.join(" ")).toContain("expires_at < NOW()");
  });

  it("(d) claimOrReplay reclaims an expired in-progress DB row instead of waiting it out", async () => {
    installFakeIdem([{
      key: "10:db-exp-3", payloadHash: payloadHash(payload), responseStatus: IDEMPOTENCY_IN_PROGRESS,
      responseBody: "", expiresAt: Date.now() - 1000,
    }]);
    const store = new DbIdempotencyStore();
    expect(await claimOrReplay(store, "10:db-exp-3", payload, 10)).toEqual({ kind: "claimed" });
    // And the fresh claim is live: a second caller now sees in-progress.
    expect(await claimOrReplay(store, "10:db-exp-3", payload, 10)).toEqual({ kind: "in-progress" });
  });

  it("(d) put() overwrites an expired row and the new response replays", async () => {
    const { rows } = installFakeIdem([completed("10:db-exp-4", Date.now() - 1000)]);
    const store = new DbIdempotencyStore();
    expect(await store.put({ key: "10:db-exp-4", payloadHash: payloadHash(payload), responseStatus: 201, responseBody: JSON.stringify({ order: "NEW" }) })).toBe(true);
    expect(rows.filter((r) => r.key === "10:db-exp-4")).toHaveLength(1);
    const rec = await store.get("10:db-exp-4");
    expect(rec?.responseStatus).toBe(201);
    expect(JSON.parse(rec!.responseBody)).toEqual({ order: "NEW" });
  });

  it("(e) checkIdempotency returns null for an expired DB key (and replays a live one)", async () => {
    installFakeIdem([
      completed("10:db-exp-5", Date.now() - 1000),
      completed("10:db-live-5", Date.now() + HOUR),
    ]);
    const store = new DbIdempotencyStore();
    expect(await checkIdempotency(store, "10:db-exp-5", payload)).toBeNull();
    expect(await checkIdempotency(store, "10:db-live-5", payload)).toEqual({ status: 201, body: { order: "OLD" } });
  });
});
