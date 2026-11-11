// Verifier dispatcher — port of PaymentAccount::verifier() / PROVIDERS map.
import { checkManual } from "./manual";
import { checkPaytmBusiness, type AccountLike, type FetchFn } from "./paytm-business";
import { checkPaytmPg } from "./paytm-pg";
import { checkPhonePePg } from "./phonepe-pg";
import type { OrderLike, VerificationResult } from "./verification-result";

export const PROVIDERS = {
  manual: { label: "Manual UPI", hosted: false, verifiable: false },
  paytm_business: { label: "Paytm for Business", hosted: false, verifiable: true },
  paytm_pg: { label: "Paytm Payment Gateway", hosted: true, verifiable: true },
  phonepe_pg: { label: "PhonePe Payment Gateway", hosted: true, verifiable: true },
} as const;
export type ProviderName = keyof typeof PROVIDERS;
export const STATUS_VERIFIABLE_PROVIDERS: ProviderName[] = ["paytm_business", "paytm_pg", "phonepe_pg"];

export async function verifyOrder(order: OrderLike, provider: string, account: AccountLike | null, fetchFn?: FetchFn): Promise<VerificationResult> {
  switch (provider) {
    case "paytm_business": return checkPaytmBusiness(order, account, fetchFn);
    case "paytm_pg": return checkPaytmPg(order, account, fetchFn);
    case "phonepe_pg": return checkPhonePePg(order, account, fetchFn);
    case "manual":
    default: return checkManual(order);
  }
}
