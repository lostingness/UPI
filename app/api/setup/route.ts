import { getSql, first, type Row } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { setupAdminSchema, parseBody } from "@/lib/validate";
import { isInstalled } from "@/lib/install";
import { newApiKey, newWebhookSecret, encryptText } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
// POST /api/setup — first-run admin creation + DB check (replaces the Laravel
// /install wizard backend). 409 once installed. GET returns install state.
export async function GET() {
  try {
    const installed = await isInstalled();
    // Round 7 (L8): the public GET used to leak `database_configured`
    // (whether DATABASE_URL is set) — infrastructure detail with no
    // legitimate public use. Only the install state is returned.
    return ok({ installed });
  } catch (e) { return handleError(e); }
}
export async function POST(req: Request) {
  try {
    if (await isInstalled()) throw new ApiError(409, "The application is already installed.");
    const body = await readJson(req);
    const data = parseBody(setupAdminSchema, body);
    const sql = getSql();
    const existing = first<Row>(await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (existing) throw new ApiError(409, "An admin already exists.");
    const live = newApiKey(false), sandbox = newApiKey(true);
    const rows = await sql`
      INSERT INTO users (name, email, password, role, api_key, api_secret, sandbox_api_key, sandbox_api_secret, webhook_secret, sandbox_webhook_secret)
      VALUES (${data.name}, ${data.email.toLowerCase()}, ${await hashPassword(data.password)}, 'admin',
        ${live.key}, ${encryptText(live.secret)}, ${sandbox.key}, ${encryptText(sandbox.secret)},
        ${encryptText(newWebhookSecret(false))}, ${encryptText(newWebhookSecret(true))})
      RETURNING id`;
    const id = Number((rows as Row[])[0].id);
    await sql`INSERT INTO installation_guards (name, user_id) VALUES ('primary_admin', ${id}) ON CONFLICT (name) DO NOTHING`;
    return ok({ installed: true, admin_id: id }, 201);
  } catch (e) { return handleError(e); }
}
