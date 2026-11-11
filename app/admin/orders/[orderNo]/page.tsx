import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ManualOverrideForm } from "@/components/admin-forms";
import { CopyButton } from "@/components/forms";
import { StatusPill, fmtDateTime, inr } from "@/components/ui";
import { getAdminOrderDetail, getClientIp } from "@/components/server-data";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const hdrs = await headers();
  const ip = getClientIp(new Request("http://localhost", { headers: hdrs }));
  return (
    <AdminShell active="/admin/orders" title={`Order ${orderNo}`} subtitle="Admin read-only view. Every view is audit-logged." next={`/admin/orders/${orderNo}`}>
      {(admin) => <AdminOrderBody orderNo={orderNo} adminId={admin.id} ip={ip} />}
    </AdminShell>
  );
}

async function AdminOrderBody({ orderNo, adminId, ip }: { orderNo: string; adminId: number; ip: string | null }) {
  const detail = await getAdminOrderDetail(orderNo, adminId, ip);
  if (!detail) notFound();
  const { order, account, merchant, webhookHistory } = detail;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[var(--muted)]">Amount</div>
              <div className="mt-1 font-mono font-medium tabular-nums text-[var(--text)] text-[clamp(1.5rem,7vw,1.875rem)]">{inr(Number(order.amount))}</div>
            </div>
            <StatusPill status={order.status} />
          </div>
          <dl className="mt-6 space-y-3 border-t border-[var(--border)] pt-5 text-sm">
            {([
              ["Order ID", order.order_no, true],
              ["Client order ID", order.client_order_id, true],
              ["Merchant", merchant ? `${merchant.businessName ?? merchant.name} (${merchant.email})` : `User #${order.user_id}`, false],
              ["Customer", order.customer_name ?? "—", false],
              ["Customer email", order.customer_email ?? "—", false],
              ["Customer mobile", order.customer_mobile ?? "—", false],
              ["Payment account", account ? `${account.label} (${account.provider})` : "—", false],
              ["UTR", order.utr ?? "—", true],
              ["Submitted UTR", order.customer_utr ?? "—", true],
              ["UTR attempts", `${order.utr_attempts} / 3`, false],
              ["Verified by", order.verified_by ?? "—", false],
              ["Paid at", fmtDateTime(order.paid_at), false],
              ["Expires at", fmtDateTime(order.expires_at), false],
              ["Created", fmtDateTime(order.created_at), false],
            ] as [string, string, boolean][]).map(([k, v, mono]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="shrink-0 text-[var(--muted)]">{k}</dt>
                <dd className={`min-w-0 text-right break-words [overflow-wrap:anywhere] text-[var(--text)] ${mono ? "font-mono text-[13px] break-all" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <div className="label">Payment URL</div>
            <div className="flex gap-2">
              <input readOnly value={order.environment === "sandbox" ? `/sandbox/pay/${order.order_no}` : `/pay/${order.order_no}`} className="input font-mono text-xs" />
              <CopyButton text={order.environment === "sandbox" ? `/sandbox/pay/${order.order_no}` : `/pay/${order.order_no}`} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2 className="card-title">Webhook history</h2></div>
          {webhookHistory.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--muted)]">No webhook attempts for this order yet.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {webhookHistory.map((l) => (
                <div key={`${l.storage_tier}-${l.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="font-mono text-[13px] text-[var(--text)]">{l.event}</span>
                  <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{l.storage_tier === "archive" ? "archived" : "active"}</span>
                    <span>attempt {l.attempt}</span>
                    <span>{l.response_code ? `HTTP ${l.response_code}` : "no response"}</span>
                    <StatusPill status={l.success ? "delivered" : "failed"} label={l.success ? "delivered" : "failed"} />
                    <span>{fmtDateTime(l.created_at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="card-title">Manual payment override</h2>
          <div className="mt-4"><ManualOverrideForm orderNo={order.order_no} amount={String(order.amount)} /></div>
        </div>
        <div className="card p-5">
          <h2 className="card-title">Admin notes</h2>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            This view is read-only except for the audited override above. UTR approve/reject is the merchant&apos;s job —
            see the order in the merchant&apos;s own dashboard. Viewing this order wrote an <code className="kbd">order_viewed</code> audit entry.
          </p>
        </div>
      </div>
    </div>
  );
}
