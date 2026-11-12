// Idempotency for POST /api/v1/orders (and dashboard order creation).
// Same key + same payload hash → replay the stored response (same order, no
// duplicate). Same key + different payload → 409 Conflict.
//
// RACE: a plain get-then-create-then-put lets two concurrent requests with
// the same key both see "no record", both create an order, and only then
// collide on put. So handlers must CLAIM first: insert a placeholder row
// (response_status 0 = in progress) before creating the order. A lost
// claim re-reads the row — replaying it once complete, or waiting briefly
// and then answering 409 "already in progress" — instead of creating a
// second order. `put` is an upsert that overwrites the claim with the
// final response. See claimOrReplay() below.
// Storage: Neon `upi_idempotency_keys` (migration 012) when the DB is present;
// an in-memory store is used only when the DB is absent (single-instance) and
// in tests (injectable store seam). Claim rows expire after 24 h
// (expires_at, migration 014 + lazy-ensure here); the prune cron deletes
// expired rows (pruneIdempotencyKeys, wired into runWebhooksPrune).
import { getSql, isDbConfigured } from "./db";
import { sha256Hex } from "./crypto";
import { ApiError } from "./errors";

export interface IdempotencyRecord { key: string; payloadHash: string; responseStatus: number; responseBody: string; /** ISO timestamp after which the record must not replay; null/undefined = no expiry (legacy rows). */ expiresAt?: string | null; }

/** responseStatus 0 = claim placeholder: the order is still being created. */
export const IDEMPOTENCY_IN_PROGRESS = 0;

/** Idempotency keys live for 24 h; after that the key is free to reuse. */
export const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

/** True when the record carries an expiry that has passed. */
function isExpired(rec: IdempotencyRecord): boolean {
  return !!rec.expiresAt && Date.parse(rec.expiresAt) <= Date.now();
}

/** Fresh expiry stamp for a new claim / stored response. */
function freshExpiresAt(): string {
  return new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  /** Insert a claim placeholder; false when the key already exists. */
  claim(rec: IdempotencyRecord): Promise<boolean>;
  /** Upsert the final response (overwrites a claim placeholder). */
  put(rec: IdempotencyRecord): Promise<boolean>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, IdempotencyRecord>();
  async get(key: string) {
    const rec = this.map.get(key);
    if (!rec) return null;
    if (isExpired(rec)) { this.map.delete(key); return null; }
    return rec;
  }
  async claim(rec: IdempotencyRecord) {
    const existing = this.map.get(rec.key);
    if (existing && !isExpired(existing)) return false;
    this.map.set(rec.key, { ...rec, expiresAt: rec.expiresAt ?? freshExpiresAt() });
    return true;
  }
  async put(rec: IdempotencyRecord) {
    this.map.set(rec.key, { ...rec, expiresAt: rec.expiresAt ?? freshExpiresAt() });
    return true;
  }
}

// --- Lazy expires_at column (migration 014) ---------------------------------
// Same self-heal idea as the allocations table: the migration file is
// canonical, but a deployed instance adds the column on first use if
// `npm run migrate` has not been run yet. Guarded once per process.
let idempotencyExpiresEnsured = false;
let idempotencyExpiresAvailable = false;

async function ensureExpiresColumn(sql: ReturnType<typeof getSql>): Promise<boolean> {
  if (idempotencyExpiresEnsured) return idempotencyExpiresAvailable;
  idempotencyExpiresEnsured = true;
  try {
    await sql`ALTER TABLE upi_idempotency_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL`;
    idempotencyExpiresAvailable = true;
  } catch {
    idempotencyExpiresAvailable = false; // column stays unavailable; inserts omit it
  }
  return idempotencyExpiresAvailable;
}

/** Delete expired idempotency rows (claims + responses older than 24 h).
 * Best-effort: returns the number pruned, 0 when the DB/column is absent. */
export async function pruneIdempotencyKeys(): Promise<number> {
  try {
    const sql = getSql();
    if (!(await ensureExpiresColumn(sql))) return 0;
    const rows = await sql`DELETE FROM upi_idempotency_keys
      WHERE expires_at < NOW()
        OR (expires_at IS NULL AND created_at < NOW() - INTERVAL '24 hours')
      RETURNING key`;
    return (rows as unknown[]).length;
  } catch { return 0; }
}

export class DbIdempotencyStore implements IdempotencyStore {
  async get(key: string) {
    const sql = getSql();
    const rows = await sql`SELECT key, payload_hash AS "payloadHash", response_status AS "responseStatus", response_body AS "responseBody", expires_at AS "expiresAt" FROM upi_idempotency_keys WHERE key = ${key} AND (expires_at IS NULL OR expires_at > NOW())`;
    const r = (rows as IdempotencyRecord[])[0];
    return r ?? null;
  }
  async claim(rec: IdempotencyRecord) {
    const sql = getSql();
    const hasExpires = await ensureExpiresColumn(sql);
    if (hasExpires) {
      // Clear an expired row for this key first: without this, the
      // ON CONFLICT DO NOTHING below would lose to the stale row and the
      // key could never be reclaimed (get() hides expired rows, but the
      // row still exists for the unique-key conflict).
      try {
        await sql`DELETE FROM upi_idempotency_keys WHERE key = ${rec.key} AND expires_at < NOW()`;
      } catch { /* best-effort; the insert below still decides ownership */ }
    }
    const rows = hasExpires
      ? await sql`INSERT INTO upi_idempotency_keys (key, payload_hash, response_status, response_body, expires_at)
          VALUES (${rec.key}, ${rec.payloadHash}, ${rec.responseStatus}, ${rec.responseBody}, NOW() + INTERVAL '24 hours')
          ON CONFLICT (key) DO NOTHING RETURNING key`
      : await sql`INSERT INTO upi_idempotency_keys (key, payload_hash, response_status, response_body)
          VALUES (${rec.key}, ${rec.payloadHash}, ${rec.responseStatus}, ${rec.responseBody})
          ON CONFLICT (key) DO NOTHING RETURNING key`;
    return (rows as unknown[]).length > 0;
  }
  async put(rec: IdempotencyRecord) {
    const sql = getSql();
    const hasExpires = await ensureExpiresColumn(sql);
    const rows = hasExpires
      ? await sql`INSERT INTO upi_idempotency_keys (key, payload_hash, response_status, response_body, expires_at)
          VALUES (${rec.key}, ${rec.payloadHash}, ${rec.responseStatus}, ${rec.responseBody}, NOW() + INTERVAL '24 hours')
          ON CONFLICT (key) DO UPDATE SET payload_hash = EXCLUDED.payload_hash,
            response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body,
            expires_at = EXCLUDED.expires_at RETURNING key`
      : await sql`INSERT INTO upi_idempotency_keys (key, payload_hash, response_status, response_body)
          VALUES (${rec.key}, ${rec.payloadHash}, ${rec.responseStatus}, ${rec.responseBody})
          ON CONFLICT (key) DO UPDATE SET payload_hash = EXCLUDED.payload_hash,
            response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body RETURNING key`;
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
 * NOTE: on its own this is still racy (see the header) — handlers that
 * create orders must use claimOrReplay() instead.
 */
export async function checkIdempotency(store: IdempotencyStore, key: string, payload: unknown): Promise<{ status: number; body: unknown } | null> {
  const existing = await store.get(key);
  if (!existing || isExpired(existing)) return null; // expired key is free to reuse (also skips the 409 below)
  if (existing.payloadHash !== payloadHash(payload)) {
    throw new ApiError(409, "Idempotency key reused with a different payload");
  }
  if (existing.responseStatus === IDEMPOTENCY_IN_PROGRESS) return null; // claimed by another request; not replayable yet
  return { status: existing.responseStatus, body: JSON.parse(existing.responseBody) };
}

export async function storeIdempotentResponse(store: IdempotencyStore, key: string, payload: unknown, status: number, body: unknown): Promise<void> {
  await store.put({ key, payloadHash: payloadHash(payload), responseStatus: status, responseBody: JSON.stringify(body) });
}

export type ClaimOutcome =
  | { kind: "claimed" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "in-progress" };

/**
 * Claim-first idempotency for order creation. Claims the key (placeholder
 * row) before the handler runs; the handler must then call
 * storeIdempotentResponse to overwrite the claim with the real response.
 * - "claimed": this request owns the key — proceed to create the order.
 * - "replay": a completed response already exists — return it, create nothing.
 * - "in-progress": another request owns the key and has not finished
 *   within `waitMs` — the caller should answer 409, not create an order.
 * Throws 409 on payload mismatch (same key, different payload).
 */
export async function claimOrReplay(
  store: IdempotencyStore, key: string, payload: unknown, waitMs = 5000,
): Promise<ClaimOutcome> {
  const hash = payloadHash(payload);
  const resolveExisting = async (rec: IdempotencyRecord | null): Promise<ClaimOutcome | null> => {
    if (!rec || isExpired(rec)) return null; // expired record is absent: no replay, no 409, reclaimable
    if (rec.payloadHash !== hash) {
      throw new ApiError(409, "Idempotency key reused with a different payload");
    }
    if (rec.responseStatus !== IDEMPOTENCY_IN_PROGRESS) {
      return { kind: "replay", status: rec.responseStatus, body: JSON.parse(rec.responseBody) };
    }
    return null; // in progress — caller decides whether to wait
  };
  const existing = await store.get(key);
  const replay = await resolveExisting(existing);
  if (replay) return replay;
  if (!existing || isExpired(existing)) {
    const claimed = await store.claim({ key, payloadHash: hash, responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" });
    if (claimed) return { kind: "claimed" };
    // Lost the race: another request claimed between get and claim.
  }
  // Another request owns the key: poll briefly for its completed response.
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const rec = await store.get(key);
    const done = await resolveExisting(rec);
    if (done) return done;
    if (!rec || isExpired(rec)) {
      // The claim vanished (pruned?) or expired — try to own the key ourselves.
      const claimed = await store.claim({ key, payloadHash: hash, responseStatus: IDEMPOTENCY_IN_PROGRESS, responseBody: "" });
      return claimed ? { kind: "claimed" } : { kind: "in-progress" };
    }
  }
  return { kind: "in-progress" };
}

export function defaultIdempotencyStore(): IdempotencyStore {
  return isDbConfigured() ? new DbIdempotencyStore() : new MemoryIdempotencyStore();
}
