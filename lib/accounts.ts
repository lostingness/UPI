// Payment account helpers — port of PaymentAccountController validation +
// PaymentAccount model helpers (used by API routes and the frontend phase).
import { getSql, first, type Row } from "./db";
import { encryptText, decryptText } from "./crypto";
import { ApiError } from "./errors";
import { gatewayConfig } from "./config/gateway";
import type { AccountRow } from "./orders/create";

export function validateAccountInput(input: Record<string, unknown>): void {
  const provider = input.provider as string;
  if (provider === "paytm_business" && gatewayConfig.enablePaytmBusiness === false) {
    throw new ApiError(422, "Paytm for Business is disabled.");
  }
  if ((provider === "paytm_business" || provider === "paytm_pg") && !input.mid) {
    throw new ApiError(422, "mid is required for this provider.");
  }
  if (provider === "paytm_pg" && !input.merchant_key) throw new ApiError(422, "merchant_key is required for Paytm PG.");
  if (provider === "phonepe_pg" && (!input.client_id || !input.client_secret || !input.client_version)) {
    throw new ApiError(422, "client_id, client_secret and client_version are required for PhonePe PG.");
  }
  if (!["paytm_pg", "phonepe_pg"].includes(provider) && !input.upi_id) {
    throw new ApiError(422, "upi_id is required for this provider.");
  }
  if ((provider === "paytm_pg" || provider === "phonepe_pg") && !input.environment) {
    throw new ApiError(422, "environment is required for hosted payment gateways.");
  }
}

export function credentialsJson(input: Record<string, unknown>): string | null {
  const provider = input.provider as string;
  let creds: Record<string, unknown> | null = null;
  if (provider === "paytm_business") creds = { mid: input.mid };
  else if (provider === "paytm_pg") creds = { mid: input.mid, merchant_key: input.merchant_key, website_name: input.website_name ?? "DEFAULT", environment: input.environment };
  else if (provider === "phonepe_pg") creds = { client_id: input.client_id, client_secret: input.client_secret, client_version: input.client_version, environment: input.environment };
  if (!creds) return null;
  return encryptText(JSON.stringify(creds));
}

export async function listAccounts(userId: number): Promise<AccountRow[]> {
  const sql = getSql();
  return (await sql`SELECT * FROM payment_accounts WHERE user_id = ${userId} ORDER BY id ASC`) as AccountRow[];
}

export async function getAccount(id: number, userId: number): Promise<AccountRow> {
  const sql = getSql();
  const row = first<AccountRow>(await sql`SELECT * FROM payment_accounts WHERE id = ${id} AND user_id = ${userId}`);
  if (!row) throw new ApiError(404, "Not found");
  return row;
}

export function publicAccount(a: AccountRow): Record<string, unknown> {
  const { credentials, ...rest } = a;
  void credentials;
  return rest;
}

export async function accountUsage(sql: ReturnType<typeof getSql>, accountId: number): Promise<{ used_today: number; remaining_today: number | null }> {
  const { usedToday } = await import("./orders/create");
  const used = await usedToday(sql, accountId);
  const row = first<Row>(await sql`SELECT daily_limit FROM payment_accounts WHERE id = ${accountId}`);
  const limit = row?.daily_limit == null ? null : Number(row.daily_limit);
  return { used_today: used, remaining_today: limit === null ? null : Math.max(0, limit - used) };
}
export function decryptCreds(a: AccountRow): Record<string, string> {
  if (!a.credentials) return {};
  try { return JSON.parse(decryptText(a.credentials) ?? "{}"); } catch { return {}; }
}
