export class DatabaseNotConfigured extends Error {
  constructor() { super("Database not configured: DATABASE_URL is not set. Set the Neon pooled DATABASE_URL env var (see .env.example) and run db/migrations/*.sql."); this.name = "DatabaseNotConfigured"; }
}
export class ProviderNotConfigured extends Error {
  constructor(provider: string) { super(`Provider not configured: ${provider} credentials are missing. Supply them via env vars (see .env.example).`); this.name = "ProviderNotConfigured"; }
}
export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[]>) { super(message); this.name = "ApiError"; }
}

/** Postgres unique-violation (Neon driver surfaces `.code === "23505"`).
 * Round 7 (G4/L5): the partial unique indexes in migration 016 (per-merchant
 * customer_utr, single admin) are the backstop for check-then-act races —
 * a lost race surfaces here instead of a duplicate row. */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "23505";
}

export function toApiError(e: unknown): { status: number; body: { message: string; errors?: Record<string, string[]> } } {
  if (e instanceof ApiError) return { status: e.status, body: { message: e.message, errors: e.errors } };
  if (e instanceof DatabaseNotConfigured) return { status: 503, body: { message: e.message } };
  if (e instanceof ProviderNotConfigured) return { status: 503, body: { message: e.message } };
  // Round 7 (G4): a unique-violation that no caller mapped explicitly is a
  // 409 conflict, never a 500 — the row the caller tried to create already
  // exists (duplicate UTR / second admin). Callers that need a specific
  // message catch isUniqueViolation() themselves and throw a clean ApiError.
  if (isUniqueViolation(e)) return { status: 409, body: { message: "Conflict: this value is already in use." } };
  return { status: 500, body: { message: "Internal server error" } };
}
