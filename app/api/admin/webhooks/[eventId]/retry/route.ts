import { requireAdminConfirmed } from "@/lib/auth";
import { getSql, first, type Row } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { ok, handleError } from "@/lib/http";
import { auditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// webhooks:retry — reset an undelivered outbox event to pending. Refuses
// delivered events, offloaded payloads (restore first), actively-claimed events.
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const admin = await requireAdminConfirmed();
    const { eventId } = await params;
    const sql = getSql();
    const row = first<Row>(await sql`SELECT * FROM webhook_outbox WHERE event_id = ${eventId}`);
    if (!row) throw new ApiError(404, "Not found");
    if (row.status === "delivered") throw new ApiError(422, "Event is already delivered.");
    if (row.payload === null) throw new ApiError(422, "Payload is offloaded. Restore it first.");
    if (row.claim_token && row.claimed_at && new Date(row.claimed_at as string).getTime() > Date.now() - 120000) {
      throw new ApiError(422, "Event is actively claimed.");
    }
    const previousAttempts = Number(row.dispatch_attempts ?? 0);
    await sql`UPDATE webhook_outbox SET status = 'pending', available_at = NOW(), dispatch_attempts = 0, last_error = NULL, claim_token = NULL, claimed_at = NULL, updated_at = NOW() WHERE event_id = ${eventId}`;
    // Audit the retry — including the dispatch_attempts reset, which is an
    // explicit admin override, not a silent counter wipe: the cumulative
    // generation counter is NOT reset, only the per-retry attempt count.
    await auditLog(sql, admin.id, "webhook_retry", "webhook_outbox", Number(row.id),
      { event_id: eventId, order_id: Number(row.order_id), previous_dispatch_attempts: previousAttempts, dispatch_attempts_reset_to: 0 },
      getClientIp(req));
    return ok({ retried: true });
  } catch (e) { return handleError(e); }
}
