// Live smoke checklist for the two QR methods — RUN IN THE VERIFICATION
// PHASE ONLY (needs a running dev server + a real Neon DATABASE_URL).
//
//   DATABASE_URL=... APP_URL=http://localhost:3000 node scripts/smoke-qr-live.mjs
//
// What it checks, end to end against the real server + database:
//   1. merchant setup/login (fresh install, or SMOKE_EMAIL/SMOKE_PASSWORD
//      of an existing admin), manual payment account creation
//   2. QR method set to unique, increment 1 paise
//   3. three live orders for the same amount get distinct payable amounts
//      (500.01, 500.02, 500.03) and the intent encodes the payable amount
//   4. the QR PNG route returns 200 + image/png
//   5. the pay status route returns payable_amount + qr_method
//   6. the allocations list shows three active rows
//   7. expiring one order (past-due expiry + a status poll, which runs the
//      real check/expire path) releases its amount
//   8. a fourth order for the same amount reuses the freed amount (500.01)
//   9. cleanup removes every row the script created
//
// DATABASE_URL, passwords and cookies are NEVER printed. The script only
// prints PASS/FAIL lines and exits non-zero on the first failure.
// Do NOT run against production: it creates and deletes a merchant, an
// account, and four orders.
import { neon } from "@neondatabase/serverless";

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("FAIL: DATABASE_URL is not set");
  process.exit(2);
}
const EMAIL = process.env.SMOKE_EMAIL ?? "qr-smoke@example.invalid";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokePass1234";
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
  try { parsed = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, headers: res.headers, body: parsed, text };
}

let userId = null;
let createdViaSetup = false;
let accountId = null;
const orderNos = [];

async function cleanup() {
  if (userId === null && orderNos.length === 0) return;
  try {
    // Delete by order_no list via one query per row (Neon HTTP driver has no
    // array binding for IN lists in template literals; the list is tiny).
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
    // Only delete the user when this script created it via /api/setup. When
    // the operator supplied an existing admin's credentials, that user stays.
    if (userId !== null && createdViaSetup) await sql`DELETE FROM users WHERE id = ${userId}`;
    console.log("PASS: cleanup removed the smoke merchant, account and orders");
  } catch (e) {
    console.error(`FAIL: cleanup incomplete — remove the smoke data by hand: ${String(e.message ?? e).slice(0, 200)}`);
    failures++;
  }
}

async function main() {
  // 1. Merchant: fresh install, or log in with the supplied admin credentials.
  const setupState = await api("/api/setup");
  check("setup state readable", setupState.status === 200, `HTTP ${setupState.status}`);
  if (setupState.body?.data?.installed === false) {
    const created = await api("/api/setup", {
      method: "POST",
      body: { name: "QR Smoke", email: EMAIL, password: PASSWORD, password_confirmation: PASSWORD },
    });
    check("admin created via setup", created.status === 201, `HTTP ${created.status}`);
    userId = created.body?.data?.admin_id ?? null;
    createdViaSetup = true;
  }
  const login = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  check("login succeeds", login.status === 200, `HTTP ${login.status}`);
  if (userId === null) userId = login.body?.data?.user?.id ?? null;
  check("session cookie set", cookie.includes("upi-gateway-session"), "no session cookie received");
  check("smoke user id known", typeof userId === "number", "user id missing");

  // 2. Manual payment account.
  const account = await api("/api/accounts", {
    method: "POST",
    body: { provider: "manual", label: "QR smoke account", upi_id: "qrsmoke@okaxis", payee_name: "QR Smoke" },
  });
  check("manual payment account created", account.status === 201, `HTTP ${account.status}`);
  accountId = account.body?.data?.id ?? null;
  check("account id known", typeof accountId === "number", "account id missing");

  // 3. QR method: unique, increment 1 paise.
  const setQr = await api("/api/settings/qr", {
    method: "POST",
    body: { qr_method: "unique", qr_increment_paise: 1 },
  });
  check("QR method set to unique", setQr.status === 200 && setQr.body?.data?.qr_method === "unique", `HTTP ${setQr.status}`);
  const getQr = await api("/api/settings/qr");
  check("QR settings read back", getQr.status === 200 && getQr.body?.data?.qr_method === "unique", `HTTP ${getQr.status}`);

  // 4. Three live orders for the same amount → distinct payable amounts.
  const expected = ["500.01", "500.02", "500.03"];
  for (let i = 0; i < 3; i++) {
    const created = await api("/api/orders", {
      method: "POST",
      body: { amount: 500, payment_account_id: accountId, customer_name: "Smoke Test" },
    });
    check(`live order ${i + 1} created`, created.status === 201, `HTTP ${created.status}`);
    const data = created.body?.data ?? {};
    orderNos.push(data.order_id);
    check(`order ${i + 1} payable amount is ${expected[i]}`, data.payable_amount === expected[i], `got ${data.payable_amount}`);
    check(`order ${i + 1} qr_method is unique`, data.qr_method === "unique", `got ${data.qr_method}`);
    check(
      `order ${i + 1} intent encodes the payable amount`,
      typeof data.upi_intent === "string" && data.upi_intent.includes(`am=${expected[i]}`),
      "intent missing or wrong am=",
    );
  }

  // 5. QR PNG route.
  const qr = await api(`/api/pay/${orderNos[0]}/qr`);
  check("QR PNG route returns 200 + image/png", qr.status === 200 && (qr.headers.get("content-type") ?? "").includes("image/png"), `HTTP ${qr.status}`);

  // 6. Pay status route returns payable_amount + qr_method.
  const status = await api(`/api/pay/${orderNos[0]}/status`);
  check(
    "pay status returns payable_amount + qr_method",
    status.status === 200 && status.body?.data?.payable_amount === "500.01" && status.body?.data?.qr_method === "unique",
    JSON.stringify(status.body?.data ?? null),
  );

  // 7. Allocations list shows three active rows.
  const allocs = await api("/api/settings/qr/allocations");
  check(
    "allocations list shows three active rows",
    allocs.status === 200 && allocs.body?.data?.total === 3 &&
      allocs.body.data.allocations.filter((a) => a.status === "active").length === 3,
    `HTTP ${allocs.status}, total ${allocs.body?.data?.total}`,
  );

  // 8. Expire the first order through the real check path, then reuse its amount.
  await sql`UPDATE orders SET expires_at = NOW() - INTERVAL '1 minute' WHERE order_no = ${orderNos[0]}`;
  const afterExpire = await api(`/api/pay/${orderNos[0]}/status`);
  check("expired order reports status expired", afterExpire.body?.data?.status === "expired", `got ${afterExpire.body?.data?.status}`);
  const released = await api("/api/settings/qr/allocations?status=released");
  check(
    "expired allocation is released",
    released.status === 200 && released.body?.data?.allocations.some((a) => a.order_no === orderNos[0]),
    `HTTP ${released.status}`,
  );
  const fourth = await api("/api/orders", {
    method: "POST",
    body: { amount: 500, payment_account_id: accountId, customer_name: "Smoke Test" },
  });
  check("fourth order created", fourth.status === 201, `HTTP ${fourth.status}`);
  orderNos.push(fourth.body?.data?.order_id);
  check("fourth order reuses the freed amount 500.01", fourth.body?.data?.payable_amount === "500.01", `got ${fourth.body?.data?.payable_amount}`);

  console.log("PASS: all QR smoke checks passed");
}

try {
  await main();
} catch (e) {
  if (failures === 0) console.error(`FAIL: ${String(e.message ?? e).slice(0, 300)}`);
} finally {
  await cleanup();
}
process.exit(failures === 0 ? 0 : 1);
