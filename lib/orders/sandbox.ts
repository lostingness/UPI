// Sandbox simulation — port of OrderService::simulateSandbox.
// One simulation only (sandbox_simulated_at must be null, else 422).
// success → paid, utr TEST+16 random, provider_txn_id TEST_TXN_+12, paid_at now,
//   verified_by=sandbox, event order.paid; failed → status failed, order.failed;
// expired → expired, order.expired; timeout → unchanged (stays pending),
//   event order.timeout (caller returns 504); pending → unchanged, order.pending;
// invalid_reference → 422, no state change.
// Sandbox orders never contact a provider and never use live markPaid.
import { getSql } from "../db";
import { ApiError } from "../errors";
import { recordOutboxEvent } from "../webhooks/outbox";
import type { OrderRow } from "./types";
import crypto from "node:crypto";

function randChars(n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
}

export async function simulateSandbox(order: OrderRow, outcome: string): Promise<{ order: OrderRow; httpStatus: number }> {
  if (order.environment !== "sandbox") throw new ApiError(422, "Only sandbox orders can be simulated.");
  if (order.sandbox_simulated_at) throw new ApiError(422, "This sandbox order has already been simulated.");
  if (outcome === "invalid_reference") throw new ApiError(422, "The simulated transaction reference is invalid.");
  const sql = getSql();
  const providerResponse = { simulated: true, environment: "sandbox", outcome };
  let updated: OrderRow[];
  if (outcome === "success") {
    const utr = "TEST" + randChars(16);
    updated = (await sql`UPDATE orders SET status = 'paid', utr = ${utr}, provider_txn_id = ${"TEST_TXN_" + randChars(12)},
      provider_response = ${JSON.stringify(providerResponse)}::jsonb, verified_by = 'sandbox', paid_at = NOW(),
      sandbox_simulated_at = NOW(), updated_at = NOW() WHERE id = ${order.id} AND sandbox_simulated_at IS NULL RETURNING *`) as OrderRow[];
  } else if (outcome === "failed") {
    updated = (await sql`UPDATE orders SET status = 'failed', provider_response = ${JSON.stringify(providerResponse)}::jsonb,
      sandbox_simulated_at = NOW(), updated_at = NOW() WHERE id = ${order.id} AND sandbox_simulated_at IS NULL RETURNING *`) as OrderRow[];
  } else if (outcome === "expired") {
    updated = (await sql`UPDATE orders SET status = 'expired', provider_response = ${JSON.stringify(providerResponse)}::jsonb,
      sandbox_simulated_at = NOW(), updated_at = NOW() WHERE id = ${order.id} AND sandbox_simulated_at IS NULL RETURNING *`) as OrderRow[];
  } else {
    // timeout / pending: no state change except the simulation marker + provider response.
    updated = (await sql`UPDATE orders SET provider_response = ${JSON.stringify(providerResponse)}::jsonb,
      sandbox_simulated_at = NOW(), updated_at = NOW() WHERE id = ${order.id} AND sandbox_simulated_at IS NULL RETURNING *`) as OrderRow[];
  }
  const row = updated[0];
  if (!row) throw new ApiError(422, "This sandbox order has already been simulated.");
  const event = outcome === "success" ? "order.paid" : outcome === "failed" ? "order.failed" : outcome === "expired" ? "order.expired" : outcome === "timeout" ? "order.timeout" : "order.pending";
  await recordOutboxEvent(sql, row, event);
  return { order: row, httpStatus: outcome === "timeout" ? 504 : 200 };
}
