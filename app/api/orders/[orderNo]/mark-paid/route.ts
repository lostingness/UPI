import { ok } from "@/lib/http";
export const dynamic = "force-dynamic";
// Deliberately disabled by design (source: OrderController::markPaid).
// Merchant-side manual payment confirmation is disabled. Use provider
// verification or administrator review.
export async function POST() {
  return ok({ message: "Merchant-side manual payment confirmation is disabled. Use provider verification or administrator review." }, 422);
}
