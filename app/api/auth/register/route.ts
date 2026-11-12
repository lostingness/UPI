import { getSql, first, type Row } from "@/lib/db";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { registerSchema, parseBody } from "@/lib/validate";
import { gatewayConfig } from "@/lib/config/gateway";
import { newApiKey, newWebhookSecret, encryptText } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
// Registration: 404 unless ALLOW_REGISTRATION=true (default false).
export async function POST(req: Request) {
  try {
    if (!gatewayConfig.allowRegistration) throw new ApiError(404, "Not found");
    const body = await readJson(req);
    const data = parseBody(registerSchema, body);
    const sql = getSql();
    const existing = first<Row>(await sql`SELECT id FROM users WHERE LOWER(email) = ${data.email.toLowerCase()}`);
    // Round 7 (L7): an existing email used to get a distinct 422 ("This
    // email is already registered") — an enumeration oracle. The response
    // is now the same shape as the success path (201, same top-level keys)
    // with null credentials and no session cookie: a caller cannot tell
    // "already registered" from "new account" by status or shape. (No
    // account is created and no keys are issued here — the nulls are
    // placeholders, never real credentials. The register form redirects on
    // any ok response; an existing user lands on the login-gated page and
    // signs in normally.)
    if (existing) {
      return ok({ user: { name: data.name, email: data.email, role: "merchant" }, api_key: null, api_secret: null }, 201);
    }
    const live = newApiKey(false), sandbox = newApiKey(true);
    const rows = await sql`
      INSERT INTO users (name, business_name, email, phone, password, role, api_key, api_secret, sandbox_api_key, sandbox_api_secret, webhook_secret, sandbox_webhook_secret)
      VALUES (${data.name}, ${data.business_name ?? null}, ${data.email.toLowerCase()}, ${data.phone ?? null}, ${await hashPassword(data.password)}, 'merchant',
        ${live.key}, ${encryptText(live.secret)}, ${sandbox.key}, ${encryptText(sandbox.secret)},
        ${encryptText(newWebhookSecret(false))}, ${encryptText(newWebhookSecret(true))})
      RETURNING id, name, email, password, role`;
    const user = (rows as Row[])[0];
    const token = await createSessionToken({ id: Number(user.id), role: "merchant", password: String(user.password) });
    await setSessionCookie(token);
    return ok({ user: { id: Number(user.id), name: user.name, email: user.email, role: "merchant" }, api_key: live.key, api_secret: live.secret }, 201);
  } catch (e) { return handleError(e); }
}
