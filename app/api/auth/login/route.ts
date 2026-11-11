import { getSql, first, type Row } from "@/lib/db";
import { verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { loginSchema, parseBody } from "@/lib/validate";
import { ApiError } from "@/lib/errors";
import { json, ok, handleError, readJson } from "@/lib/http";
import { checkDbRateLimit, checkMemoryRateLimit, getClientIp } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// Login: generic error (no user enumeration); per-email+IP 5 attempts/min,
// then 10 failures/15 min → 15-min lock (upi_login_attempts table).
// Disabled account → 403 after auth. Success clears counters, regenerates session.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const data = parseBody(loginSchema, body);
    const ip = getClientIp(req);
    const lockKey = `login:${Buffer.from(`${data.email.toLowerCase()}|${ip}`).toString("base64")}`;
    const sql = getSql();
    const lock = first<Row>(await sql`SELECT fails, locked_until FROM upi_login_attempts WHERE lock_key = ${lockKey}`);
    if (lock?.locked_until && new Date(lock.locked_until as string).getTime() > Date.now()) {
      throw new ApiError(429, "Too many login attempts. Try again later.");
    }
    const attempt = checkMemoryRateLimit(`login:${data.email.toLowerCase()}|${ip}`, 5);
    if (!attempt.allowed) throw new ApiError(429, "Too many login attempts. Try again later.");
    const user = first<Row>(await sql`SELECT id, name, email, password, role, is_active FROM users WHERE LOWER(email) = ${data.email.toLowerCase()}`);
    const fail = async () => {
      const fails = Number(lock?.fails ?? 0) + 1;
      const lockedUntil = fails >= 10 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await sql`INSERT INTO upi_login_attempts (lock_key, fails, locked_until) VALUES (${lockKey}, ${fails}, ${lockedUntil})
        ON CONFLICT (lock_key) DO UPDATE SET fails = EXCLUDED.fails, locked_until = EXCLUDED.locked_until, updated_at = NOW()`;
      throw new ApiError(401, "These credentials do not match our records.");
    };
    if (!user) return fail();
    if (!(await verifyPassword(data.password, String(user.password)))) return fail();
    if (user.is_active !== true) throw new ApiError(403, "Your account has been disabled");
    await sql`DELETE FROM upi_login_attempts WHERE lock_key = ${lockKey}`;
    const token = await createSessionToken({ id: Number(user.id), role: String(user.role), password: String(user.password) });
    await setSessionCookie(token);
    return ok({ user: { id: Number(user.id), name: user.name, email: user.email, role: user.role } });
  } catch (e) { return handleError(e); }
}
