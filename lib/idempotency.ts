// Idempotency for POST /api/v1/orders (and dashboard order creation).
// Same key + same payload hash → replay the stored response (same order, no
// duplicate). Same key + different payload → 409 Conflict.
// Storage: Neon `upi_idempotency_keys` (migration 012) when the DB is present;
// an in-memory store is used only when the DB is absent (single-instance) and
// in tests (injectable store seam).
import { getSql, isDbConfigured } from "./db";
import { sha256Hex } from "./crypto";
import { ApiError } from "./errors";

export interface IdempotencyRecord { key: string; payloadHash: string; responseStatus: number; responseBody: string; }

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(rec: IdempotencyRecord): Promise<boolean>; // false if key already exists
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, IdempotencyRecord>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async put(rec: IdempotencyRecord) {
    if (this.map.has(rec.key)) return false;
    this.map.set(rec.key, rec); return true;
  }
}

export class DbIdempotencyStore implements IdempotencyStore {
  async get(key: string) {
    const sql = getSql();
    const rows = await sql`SELECT key, payload_hash AS "payloadHash", response_status AS "responseStatus", response_body AS "responseBody" FROM upi_idempotency_keys WHERE key = ${key}`;
    const r = (rows as IdempotencyRecord[])[0];
    return r ?? null;
  }
  async put(rec: IdempotencyRecord) {
    const sql = getSql();
    const rows = await sql`INSERT INTO upi_idempotency_keys (key, payload_hash, response_status, response_body) VALUES (${rec.key}, ${rec.payloadHash}, ${rec.responseStatus}, ${rec.responseBody}) ON CONFLICT (key) DO NOTHING RETURNING key`;
    return (rows as unknown[]).length > 0;
  }
}

export function payloadHash(payload: unknown): string {
  return sha256Hex(JSON.stringify(payload));
}

/**
 * Check an idempotency key before running the handler.
 * Returns a stored response to replay, or null to proceed. Throws 409 on
 * payload mismatch. After the handler succeeds, call `storeIdempotentResponse`.
 */
export async function checkIdempotency(store: IdempotencyStore, key: string, payload: unknown): Promise<{ status: number; body: unknown } | null> {
  const existing = await store.get(key);
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash(payload)) {
    throw new ApiError(409, "Idempotency key reused with a different payload");
  }
  return { status: existing.responseStatus, body: JSON.parse(existing.responseBody) };
}

export async function storeIdempotentResponse(store: IdempotencyStore, key: string, payload: unknown, status: number, body: unknown): Promise<void> {
  await store.put({ key, payloadHash: payloadHash(payload), responseStatus: status, responseBody: JSON.stringify(body) });
}

export function defaultIdempotencyStore(): IdempotencyStore {
  return isDbConfigured() ? new DbIdempotencyStore() : new MemoryIdempotencyStore();
}
