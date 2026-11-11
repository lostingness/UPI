// Supplementary live checks for the two QR methods (verification phase only).
// Needs the local dev server + real Neon DATABASE_URL. Creates a throwaway
// merchant via /api/auth/register (local server runs with ALLOW_REGISTRATION=true),
// then deletes everything it created. Passwords/cookies are never printed.
import { neon } from "@neondatabase/serverless";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("FAIL: DATABASE_URL is not set"); process.exit(2); }
const EMAIL = "qr-extra@example.invalid";
const PASSWORD = "SmokePass1234";
const sql = neon(DATABASE_URL);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { failures++; throw new Error(`smoke failed at: ${name}`); }
}

let cookie = "";
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, body: parsed, text };
}

let userId = null;
let accountId = null;
const orderNos = [];

async function cleanup() {
  try {
    for (const no of orderNos) {
      const rows = await sql`SELECT id FROM orders WHERE order_no = ${no}`;
      const id = rows[0]?.id;
      if (id == null) continue;
      await sql`DELETE FROM webhook_outbox WHERE order_id = ${id}`;
      await sql`DELETE FROM webhook_logs WHERE order_id = ${id}`;
      await sql`DELETE FROM upi_amount_allocations WHERE order_id = ${id}`;
      await sql`DELETE FROM orders WHERE id = ${id}`;
    }
    if (accountId !== null) await sql`DELETE FROM payment_accounts WHERE id = ${accountId}`;
    if (userId !== null) await sql`DELETE FROM users WHERE id = ${userId}`;
    console.log("PASS: extra-smoke cleanup done");
  } catch (e) {
    console.error(`FAIL: extra cleanup incomplete: ${String(e.message ?? e).slice(0, 200)}`);
    failures++;
  }
}

async function main() {
  // Register + login a throwaway merchant.
  const reg = await api("/api/auth/register", { method: "POST", body: { name: "QR Extra", business_name: "QR Extra", email: EMAIL, password: PASSWORD, password_confirmation: PASSWORD } });
  check("extra merchant registered", reg.status === 201, `HTTP ${reg.status}`);
  userId = reg.body?.data?.user?.id ?? null;
  check("extra user id known", typeof userId === "number", "user id missing");

  const account = await api("/api/accounts", { method: "POST", body: { provider: "manual", label: "extra account", upi_id: "qrextra@okaxis", payee_name: "QR Extra" } });
  check("extra manual account created", account.status === 201, `HTTP ${account.status}`);
  accountId = account.body?.data?.id ?? null;

  // --- Same Amount mode ---
  const setSame = await api("/api/settings/qr", { method: "POST", body: { qr_method: "same", qr_increment_paise: 1 } });
  check("QR method set to same", setSame.status === 200 && setSame.body?.data?.qr_method === "same", `HTTP ${setSame.status}`);
  const sameOrder = await api("/api/orders", { method: "POST", body: { amount: 500, payment_account_id: accountId, customer_name: "Extra Test" } });
  check("same-mode order created", sameOrder.status === 201, `HTTP ${sameOrder.status}`);
  const sameNo = sameOrder.body?.data?.order_id;
  orderNos.push(sameNo);
  check("same-mode payable is exactly 500.00", sameOrder.body?.data?.payable_amount === "500.00", `got ${sameOrder.body?.data?.payable_amount}`);
  check("same-mode qr_method is same", sameOrder.body?.data?.qr_method === "same", `got ${sameOrder.body?.data?.qr_method}`);
  check("same-mode intent encodes am=500.00", typeof sameOrder.body?.data?.upi_intent === "string" && sameOrder.body.data.upi_intent.includes("am=500.00"), "intent wrong");
  const allocsSame = await api("/api/settings/qr/allocations");
  check("same-mode creates NO allocation row", allocsSame.status === 200 && allocsSame.body?.data?.total === 0, `total ${allocsSame.body?.data?.total}`);

  // --- Unique mode + duplicate-allocation constraint ---
  const setUnique = await api("/api/settings/qr", { method: "POST", body: { qr_method: "unique", qr_increment_paise: 1 } });
  check("QR method set to unique", setUnique.status === 200, `HTTP ${setUnique.status}`);
  const uOrder = await api("/api/orders", { method: "POST", body: { amount: 500, payment_account_id: accountId, customer_name: "Extra Test" } });
  check("unique-mode order created", uOrder.status === 201, `HTTP ${uOrder.status}`);
  const uNo = uOrder.body?.data?.order_id;
  orderNos.push(uNo);
  check("unique-mode payable is 500.01", uOrder.body?.data?.payable_amount === "500.01", `got ${uOrder.body?.data?.payable_amount}`);
  // Direct duplicate active allocation must violate the partial unique index.
  const uRow = await sql`SELECT id FROM orders WHERE order_no = ${uNo}`;
  const uId = Number(uRow[0]?.id);
  let dupFailed = false;
  try {
    await sql`INSERT INTO upi_amount_allocations (user_id, payment_account_id, order_id, order_no, base_amount, payable_amount, status, expires_at) VALUES (${userId}, ${accountId}, ${uId}, ${uNo}, 500.00, 500.01, 'active', NOW() + INTERVAL '15 minutes')`;
  } catch (e) {
    dupFailed = String(e.message ?? e).includes("upi_amount_allocations_user_active_unique") || String(e.code ?? e).includes("23505");
  }
  check("duplicate ACTIVE allocation rejected by unique index", dupFailed, "insert unexpectedly succeeded");

  // --- UTR flow on the same-mode order ---
  const utr = await api(`/api/pay/${sameNo}/utr`, { method: "POST", body: { utr: "123456789012" } });
  check("UTR submit succeeds", utr.status === 200, `HTTP ${utr.status} ${utr.text.slice(0, 120)}`);
  const detail1 = await api(`/api/orders/${sameNo}`);
  check("UTR submit moves order to review (NOT paid)", detail1.body?.data?.order?.status === "review", `status ${detail1.body?.data?.order?.status}`);
  const approveWrongAmt = await api(`/api/orders/${sameNo}/approve-utr`, { method: "POST", body: { bank_utr: "123456789012", received_amount: 499.99 } });
  check("approve with wrong amount rejected", approveWrongAmt.status === 422, `HTTP ${approveWrongAmt.status}`);
  const approveWrongUtr = await api(`/api/orders/${sameNo}/approve-utr`, { method: "POST", body: { bank_utr: "999999999999", received_amount: 500 } });
  check("approve with wrong UTR rejected", approveWrongUtr.status === 422, `HTTP ${approveWrongUtr.status}`);
  const approveOk = await api(`/api/orders/${sameNo}/approve-utr`, { method: "POST", body: { bank_utr: "123456789012", received_amount: 500 } });
  check("approve with exact amount + matching UTR succeeds", approveOk.status === 200, `HTTP ${approveOk.status} ${approveOk.text.slice(0, 120)}`);
  const paidRow = await sql`SELECT status, verified_by FROM orders WHERE order_no = ${sameNo}`;
  check("approved order is paid via utr_review", paidRow[0]?.status === "paid" && paidRow[0]?.verified_by === "utr_review", JSON.stringify(paidRow[0]));

  // --- Mark-paid stub stays disabled ---
  const markPaid = await api(`/api/orders/${uNo}/mark-paid`, { method: "POST", body: {} });
  check("merchant mark-paid stub disabled (422)", markPaid.status === 422, `HTTP ${markPaid.status}`);
  const stillPending = await sql`SELECT status FROM orders WHERE order_no = ${uNo}`;
  check("order still pending after mark-paid attempt", stillPending[0]?.status === "pending", `status ${stillPending[0]?.status}`);

  // --- Dashboard shows REAL data ---
  const stats = await api("/api/dashboard/stats");
  const dbCounts = await sql`SELECT COUNT(*) FILTER (WHERE status='paid') AS paid, COUNT(*) FILTER (WHERE status='pending') AS pending, COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS total FROM orders WHERE user_id = ${userId} AND environment='live'`;
  const d = dbCounts[0];
  check("dashboard paidCount matches DB", stats.status === 200 && stats.body?.data?.paidCount === Number(d.paid), `api ${stats.body?.data?.paidCount} vs db ${d.paid}`);
  check("dashboard pendingCount matches DB", stats.body?.data?.pendingCount === Number(d.pending), `api ${stats.body?.data?.pendingCount} vs db ${d.pending}`);
  check("dashboard totalAmount matches DB", stats.body?.data?.totalAmount === Number(d.total), `api ${stats.body?.data?.totalAmount} vs db ${d.total}`);
  check("dashboard recent orders are the real created orders", Array.isArray(stats.body?.data?.recentOrders) && stats.body.data.recentOrders.some((o) => o.order_no === sameNo), "recent list missing our orders");

  console.log("PASS: all extra QR checks passed");
}

try { await main(); } catch (e) { if (failures === 0) console.error(`FAIL: ${String(e.message ?? e).slice(0, 300)}`); } finally { await cleanup(); }
process.exit(failures === 0 ? 0 : 1);
