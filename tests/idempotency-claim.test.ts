// MOCKED (in-memory store, no DB, no real network).
// Idempotency claim-first race fix (round-2 integration audit):
// claim before creating, replay a completed response, 409 while another
// request owns the key; put() overwrites a claim with the final response.
import { describe, it, expect } from "vitest";
import {
  MemoryIdempotencyStore, claimOrReplay, checkIdempotency, storeIdempotentResponse,
  IDEMPOTENCY_IN_PROGRESS,
} from "../lib/idempotency";

describe("idempotency claim-first", () => {
  it("first claim wins; second caller sees in-progress, then replays once stored", async () => {
    const store = new MemoryIdempotencyStore();
    const payload = { amount: 100 };
    expect(await claimOrReplay(store, "7:key-1", payload, 10)).toEqual({ kind: "claimed" });
    // Same payload while the first request is still working: in-progress.
    expect(await claimOrReplay(store, "7:key-1", payload, 10)).toEqual({ kind: "in-progress" });
    // checkIdempotency does not replay an in-progress claim.
    expect(await checkIdempotency(store, "7:key-1", payload)).toBeNull();
    // First request finishes: the response overwrites the claim.
    await storeIdempotentResponse(store, "7:key-1", payload, 201, { ok: true });
    const replay = await claimOrReplay(store, "7:key-1", payload, 10);
    expect(replay).toEqual({ kind: "replay", status: 201, body: { ok: true } });
  });

  it("same key + different payload is a 409, before and after completion", async () => {
    const store = new MemoryIdempotencyStore();
    expect(await claimOrReplay(store, "7:key-2", { amount: 100 }, 10)).toEqual({ kind: "claimed" });
    await expect(claimOrReplay(store, "7:key-2", { amount: 200 }, 10)).rejects.toMatchObject({ status: 409 });
    await storeIdempotentResponse(store, "7:key-2", { amount: 100 }, 201, { ok: true });
    await expect(claimOrReplay(store, "7:key-2", { amount: 200 }, 10)).rejects.toMatchObject({ status: 409 });
  });

  it("claim placeholder carries the in-progress sentinel", async () => {
    const store = new MemoryIdempotencyStore();
    await store.claim({ key: "7:key-3", payloadHash: "x", responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" });
    expect(await store.claim({ key: "7:key-3", payloadHash: "x", responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" })).toBe(false);
    const rec = await store.get("7:key-3");
    expect(rec?.responseStatus).toBe(IDEMPOTENCY_IN_PROGRESS);
  });
});
