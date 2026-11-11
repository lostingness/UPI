// MOCKED (no DB, no network, no DATABASE_URL).
// Checkout-page redirect gate — the residual gap after the status route
// fix: the paid state's "Continue to merchant site →" link on /pay/[orderNo]
// used to render the raw order.redirect_url. getPayData now gates it
// server-side with the same allowedRedirectForStatus helper the status
// route uses (paid AND host in the merchant's redirect_domains), so the
// client component only ever receives an allowlisted URL or null — a
// tampered client cannot re-enable a non-allowlisted link.
import { describe, it, expect, afterEach, vi } from "vitest";
// server-only is a Next.js build-time marker, not an installed package in
// this tree — stub it out so the server-data module can load under vitest.
vi.mock("server-only", () => ({}));
import { __setSqlForTests } from "../lib/db";
import { getPayData } from "../components/server-data";
import type { OrderRow } from "../lib/orders/types";

afterEach(() => { __setSqlForTests(null); });

function baseOrder(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1, order_no: "ORDABCDEFGHIJKLMN", user_id: 7, payment_account_id: null,
    client_order_id: "ORDABCDEFGHIJKLMN", amount: "499.00", status: "paid", environment: "live",
    customer_name: "Test", customer_email: null, customer_mobile: "9999999999", note: "hi",
    redirect_url: "https://example.com/done",
    utr: "412345678901", customer_utr: null, utr_submitted_at: null, utr_attempts: 0, review_note: null,
    provider_txn_id: null, provider_response: null, provider_checkout: null, verified_by: null,
    paid_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    original_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_checked_at: null, sandbox_simulated_at: null, webhook_event_sequence: 0,
    verification_token: null, verification_generation: 0, verification_expires_at: null,
    verification_pid: null, verification_started_at: null, verification_node_id: null,
    verification_node_instance_id: null, verification_process_identity: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
}

// Fake Neon sql client: dispatches on the SQL text.
function installFake(order: OrderRow | null, domains: string[] | null) {
  const fn = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("redirect_domains")) return domains === null ? [] : [{ redirect_domains: domains }];
    if (text.includes("FROM users WHERE id")) return [{ name: "Merchant Seven", business_name: "Seven Store" }];
    if (text.includes("FROM orders WHERE order_no")) return order ? [order] : [];
    return [];
  };
  __setSqlForTests(fn as never);
}

describe("getPayData — checkout redirect allowlist gate", () => {
  it("returns the redirect_url when paid and allowlisted", async () => {
    installFake(baseOrder(), ["example.com"]);
    const data = await getPayData("ORDABCDEFGHIJKLMN");
    expect(data).not.toBeNull();
    expect(data!.redirectUrl).toBe("https://example.com/done");
    // Paid confirmation itself is intact.
    expect(data!.order.status).toBe("paid");
  });

  it("returns null (no merchant link) when paid but not allowlisted", async () => {
    installFake(baseOrder({ redirect_url: "https://evil.example/done" }), ["example.com"]);
    const data = await getPayData("ORDABCDEFGHIJKLMN");
    expect(data).not.toBeNull();
    expect(data!.redirectUrl).toBeNull();
    expect(data!.order.status).toBe("paid");
  });

  it("returns null when not paid, even if allowlisted", async () => {
    installFake(baseOrder({ status: "pending" }), ["example.com"]);
    const data = await getPayData("ORDABCDEFGHIJKLMN");
    expect(data).not.toBeNull();
    expect(data!.redirectUrl).toBeNull();
  });

  it("returns null when the merchant has no allowlisted domains", async () => {
    installFake(baseOrder(), []);
    const data = await getPayData("ORDABCDEFGHIJKLMN");
    expect(data).not.toBeNull();
    expect(data!.redirectUrl).toBeNull();
  });

  it("returns null when the merchant row is missing (no domains)", async () => {
    installFake(baseOrder(), null);
    const data = await getPayData("ORDABCDEFGHIJKLMN");
    expect(data).not.toBeNull();
    expect(data!.redirectUrl).toBeNull();
  });

  it("returns null for an unknown order", async () => {
    installFake(null, ["example.com"]);
    expect(await getPayData("ORDDOESNOTEXIST00")).toBeNull();
  });
});
