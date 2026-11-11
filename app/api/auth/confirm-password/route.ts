import { requireSession, verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
import { checkMemoryRateLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// Re-confirm password; sets passwordConfirmedAt in the session (gates /admin/*
// for 900 s). 5 attempts/min per user.
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const attempt = checkMemoryRateLimit(`confirm-password:${session.id}`, 5);
    if (!attempt.allowed) throw new ApiError(429, "Too many attempts. Try again later.");
    const body = await readJson(req);
    const sql = getSql();
    const user = first<Row>(await sql`SELECT password, role FROM users WHERE id = ${session.id}`);
    if (!user || !(await verifyPassword(String((body as { password?: string }).password ?? ""), String(user.password)))) {
      throw new ApiError(401, "The password is incorrect.");
    }
    const token = await createSessionToken(
      { id: session.id, role: String(user.role), password: String(user.password) },
      Math.floor(Date.now() / 1000),
    );
    await setSessionCookie(token);
    return ok({ confirmed: true });
  } catch (e) { return handleError(e); }
}
