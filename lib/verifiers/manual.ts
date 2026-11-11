// ManualVerifier — port of ManualVerifier.php (17 lines).
// Never marks paid by itself; the merchant confirms via the UTR review flow
// (lib/orders/utr.ts). Always returns pending.
import { VerificationResult, type OrderLike } from "./verification-result";
export async function checkManual(_order: OrderLike): Promise<ReturnType<typeof VerificationResult.pending>> {
  return VerificationResult.pending({ code: "manual_review" });
}
