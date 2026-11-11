// Delete the demo screenshot fixture (user id 5, "Demo Store") from the shared
// Neon database. NEVER touches user id 1 (Mohit) or any of his rows.
// Usage: node --env-file=.env.local scripts/cleanup-demo.mjs
// DATABASE_URL is read from the environment only — never printed.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DEMO_USER_ID = 5;

const before = await sql`SELECT id, email, name FROM users ORDER BY id`;
console.log("users before:", JSON.stringify(before.map((u) => ({ id: Number(u.id), email: u.email }))));

const demo = before.find((u) => Number(u.id) === DEMO_USER_ID);
if (!demo) {
  console.log("demo user already gone — nothing to delete");
  process.exit(0);
}
if (demo.email !== "demo-store@example.invalid") {
  throw new Error(`ABORT: user 5 is ${demo.email}, not the demo merchant`);
}

// Non-cascading rows first: webhook_outbox references orders with
// ON DELETE RESTRICT, so it must go before the orders. webhook_logs
// cascades with the orders; admin_audit_logs SET NULLs on user delete,
// so delete those rows outright. Idempotency keys have no user column
// and expire on their own; login-attempt lock keys are email-based.
const demoOrders = await sql`SELECT id, order_no FROM orders WHERE user_id = ${DEMO_USER_ID}`;
const orderNos = demoOrders.map((o) => o.order_no);
console.log("demo orders:", JSON.stringify(orderNos));
for (const o of demoOrders) {
  await sql`DELETE FROM webhook_outbox WHERE order_id = ${o.id}`;
}
await sql`DELETE FROM admin_audit_logs WHERE actor_admin_id = ${DEMO_USER_ID} OR admin_id = ${DEMO_USER_ID}`;
await sql`DELETE FROM upi_login_attempts WHERE lock_key LIKE '%demo-store%'`;
// user row last — payment_accounts, orders, upi_amount_allocations cascade.
const deleted = await sql`DELETE FROM users WHERE id = ${DEMO_USER_ID} RETURNING id`;
console.log("deleted demo user rows:", deleted.length);

const after = await sql`SELECT id, email, name FROM users ORDER BY id`;
console.log("users after:", JSON.stringify(after.map((u) => ({ id: Number(u.id), email: u.email }))));
const counts = await sql`
  SELECT
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM payment_accounts) AS accounts,
    (SELECT COUNT(*) FROM upi_amount_allocations) AS allocations`;
console.log("remaining:", JSON.stringify(counts[0], (k, v) => (typeof v === "bigint" ? Number(v) : v)));
const mohitOrders = await sql`SELECT order_no, status FROM orders ORDER BY created_at`;
console.log("orders left:", JSON.stringify(mohitOrders));
