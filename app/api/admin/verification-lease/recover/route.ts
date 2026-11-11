import { requireAdminConfirmed } from "@/lib/auth";
import { loadOrderByNo } from "@/lib/orders/check";
import { getSql } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";
import { ApiError } from "@/lib/errors";
import { ok, handleError, readJson } from "@/lib/http";
export const dynamic = "force-dynamic";
// Operator lease recovery (replaces Artisan orders:recover-verification-lease).
// On Vercel there is no PID/process identity, so recovery only requires:
// the lease to be expired, a matching generation, and an explicit operator
// identity + reason. The recovery is written to
// verification_lease_recovery_audits (execution token stored as sha256 hash).
export async function POST(req: Request) {
  try {
    const admin = await requireAdminConfirmed();
    const body = (await readJson(req)) as { order_no?: string; generation?: number; operator?: string; reason?: string; execution_token?: string };
    if (!body.order_no || typeof body.generation !== "number" || !body.operator || !body.reason) {
      throw new ApiError(422, "order_no, generation, operator and reason are required.");
    }
    const order = await loadOrderByNo(body.order_no);
    if (!order) throw new ApiError(404, "Order not found");
    if (order.verification_expires_at && new Date(order.verification_expires_at).getTime() > Date.now()) {
      throw new ApiError(422, "The verification lease has not expired yet.");
    }
    if (order.verification_generation !== body.generation) {
      throw new ApiError(422, "Generation mismatch — the lease has changed.");
    }
    const sql = getSql();
    await sql`UPDATE orders SET verification_token = NULL, verification_generation = 0, verification_expires_at = NULL,
      verification_started_at = NULL, verification_node_id = NULL, verification_node_instance_id = NULL,
      verification_process_identity = NULL, updated_at = NOW() WHERE id = ${order.id}`;
    await sql`INSERT INTO verification_lease_recovery_audits
      (order_id, order_no, previous_generation, previous_node_id, previous_node_instance_id, previous_pid, previous_process_identity, execution_token_hash, operator_identity, reason, outcome)
      VALUES (${order.id}, ${order.order_no}, ${order.verification_generation}, ${order.verification_node_id}, ${order.verification_node_instance_id}, ${order.verification_pid}, ${order.verification_process_identity}, ${sha256Hex(body.execution_token ?? crypto.randomUUID())}, ${body.operator}, ${body.reason}, 'recovered')`;
    return ok({ recovered: true });
  } catch (e) { return handleError(e); }
}
