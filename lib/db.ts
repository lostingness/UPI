// Lazy Neon client. `neon()` is only called when DATABASE_URL is present, so
// `next build` / typecheck succeed with no DB configured. Any route needing the
// DB throws DatabaseNotConfigured (503) — never fake data, never a fake payment.
//
// OPEN QUESTION §5.4 Q1 — Neon HTTP-driver transactions: @neondatabase/serverless
// `transaction()` runs statements in one HTTP request but does NOT hold a
// connection across awaits like node-postgres. This codebase therefore does NOT
// rely on multi-statement transactions with SELECT ... FOR UPDATE across awaits.
// Atomicity is achieved with single-statement conditional UPDATEs (status guard
// in the WHERE clause; check affected-row count) plus idempotent outbox INSERTs
// guarded by the unique transition_key (ON CONFLICT DO NOTHING). That gives the
// same exactly-once transition semantics the Laravel code got from row locks,
// without depending on HTTP-driver transaction semantics.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { DatabaseNotConfigured } from "./errors";

let client: NeonQueryFunction<false, false> | null = null;
let override: NeonQueryFunction<false, false> | null = null;

/** Test seam: inject a fake sql client (used by tests only). */
export function __setSqlForTests(sql: NeonQueryFunction<false, false> | null) { override = sql; }
export function isDbConfigured(): boolean { return Boolean(process.env.DATABASE_URL); }

export function getSql(): NeonQueryFunction<false, false> {
  if (override) return override;
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfigured();
  client = neon(url);
  return client;
}

/** Run a callback with the sql client; throws DatabaseNotConfigured when absent. */
export async function withDb<T>(fn: (sql: NeonQueryFunction<false, false>) => Promise<T>): Promise<T> {
  return fn(getSql());
}

export type Sql = NeonQueryFunction<false, false>;
export type Row = Record<string, unknown>;
export function rows<T = Row>(r: unknown): T[] { return r as T[]; }
export function first<T = Row>(r: unknown): T | undefined { return (r as T[])[0]; }
