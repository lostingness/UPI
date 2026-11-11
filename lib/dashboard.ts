// Dashboard stats — port of DashboardController (single grouped aggregation;
// IST day boundaries via AT TIME ZONE 'Asia/Kolkata').
import { getSql } from "./db";

export async function dashboardStats(userId: number, environment: "live" | "sandbox") {
  const sql = getSql();
  const counts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'review') AS review_count,
      COUNT(*) FILTER (WHERE status IN ('paid','expired','failed')) AS closed_count,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_amount,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata'), 0) AS today_amount,
      COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata') AS today_count
    FROM orders WHERE user_id = ${userId} AND environment = ${environment}`;
  const chart = await sql`
    SELECT (paid_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
      COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
    FROM orders
    WHERE user_id = ${userId} AND environment = ${environment} AND status = 'paid'
      AND paid_at >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '6 days'
    GROUP BY day ORDER BY day ASC`;
  const recent = await sql`
    SELECT o.*, pa.label AS account_label, pa.provider AS account_provider FROM orders o
    LEFT JOIN payment_accounts pa ON pa.id = o.payment_account_id
    WHERE o.user_id = ${userId} AND o.environment = ${environment}
    ORDER BY o.created_at DESC LIMIT 6`;
  const c = (counts as Record<string, string>[])[0];
  const paid = Number(c.paid_count), closed = Number(c.closed_count);
  return {
    paidCount: paid, pendingCount: Number(c.pending_count), reviewCount: Number(c.review_count),
    closedCount: closed, totalAmount: Number(c.total_amount), todayAmount: Number(c.today_amount),
    todayCount: Number(c.today_count),
    successRate: closed > 0 ? paid / closed : null,
    chart7d: (chart as { day: string; amount: string; count: string }[]).map((r) => ({ date: String(r.day), amount: Number(r.amount), count: Number(r.count) })),
    recentOrders: recent,
  };
}
