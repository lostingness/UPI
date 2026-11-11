export class DatabaseNotConfigured extends Error {
  constructor() { super("Database not configured: DATABASE_URL is not set. Set the Neon pooled DATABASE_URL env var (see .env.example) and run db/migrations/*.sql."); this.name = "DatabaseNotConfigured"; }
}
export class ProviderNotConfigured extends Error {
  constructor(provider: string) { super(`Provider not configured: ${provider} credentials are missing. Supply them via env vars (see .env.example).`); this.name = "ProviderNotConfigured"; }
}
export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[]>) { super(message); this.name = "ApiError"; }
}
export function toApiError(e: unknown): { status: number; body: { message: string; errors?: Record<string, string[]> } } {
  if (e instanceof ApiError) return { status: e.status, body: { message: e.message, errors: e.errors } };
  if (e instanceof DatabaseNotConfigured) return { status: 503, body: { message: e.message } };
  if (e instanceof ProviderNotConfigured) return { status: 503, body: { message: e.message } };
  return { status: 500, body: { message: "Internal server error" } };
}
