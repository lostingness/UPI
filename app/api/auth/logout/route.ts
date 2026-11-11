import { clearSessionCookie } from "@/lib/auth";
import { ok, handleError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST() {
  try { await clearSessionCookie(); return ok({ logged_out: true }); }
  catch (e) { return handleError(e); }
}
