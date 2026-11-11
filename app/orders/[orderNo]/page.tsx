import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout";
import { CopyButton } from "@/components/forms";
import { ApproveUtrForm, RecheckButton, RejectUtrForm } from "@/components/order-actions";
import { DbNotConfigured, StatusPill, fmtDateTime, inr } from "@/components/ui";
import { dbConfigured, getOrderDetail, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const session = await getSessionSafe();
  const user = requireUser(session, `/orders/${orderNo}`);
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/orders" title={`Order ${orderNo}`} subtitle="Order detail.">
        <DbNotConfigured context="Order detail needs the database." />
      </AppShell>
    );
  }
  const detail = await getOrderDetail(orderNo, user);
  if (!detail) notFound();
  const { order, account, webhookHistory, readOnly } = detail;
  const api = detail.api as Record<string, unknown>;
  const paymentUrl = String(api.payment_url ?? "");
  const upiIntent = api.upi_intent ? String(api.upi_intent) : null;
  const isReview = order.status === "review";

  return (
    <AppShell
      user={user} active="/orders" title={`Order ${order.order_no}`}
      subtitle={`${order.client_order_id} · ${order.environment === "sandbox" ? "Sandbox (TEST)" : "Live"}`}
      actions={<RecheckButton orderNo={order.order_no} />}
    >
      {readOnly && (
        <div className="mb-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
          Read-only view — {order.environment === "sandbox" ? "sandbox orders cannot be changed here." : "you are viewing this order as an administrator."}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">Amount</div>
                <div className="mt-1 font-mono text-3xl font-medium text-slate-50 tabular-nums">{inr(Number(order.amount))}</div>
                {order.note && <p className="mt-2 text-sm text-slate-400">{order.note}</p>}
              </div>
              <StatusPill status={order.status} />
            </div>
            <dl className="mt-6 space-y-3 border-t border-slate-800 pt-5 text-sm">
              {([
                ["Order ID", order.order_no, true],
                ["Client order ID", order.client_order_id, true],
                ["Customer", order.customer_name ?? "—", false],
                ["Customer email", order.customer_email ?? "—", false],
                ["Customer mobile", order.customer_mobile ?? "—", false],
                ["Payment account", account ? `${account.label} (${account.provider})` : "—", false],
                ["UPI ID", account?.upi_id ?? "—", true],
                ["Payee", account?.payee_name ?? "—", false],
                ["UTR", order.utr ?? "—", true],
                ["Submitted UTR", order.customer_utr ?? "—", true],
                ["UTR attempts", `${order.utr_attempts} / 3`, false],
                ["Verified by", order.verified_by ?? "—", false],
                ["Paid at", fmtDateTime(order.paid_at), false],
                ["Expires at", fmtDateTime(order.expires_at), false],
                ["Created", fmtDateTime(order.created_at), false],
              ] as [string, string, boolean][]).map(([k, v, mono]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className={`min-w-0 text-right text-slate-200 ${mono ? "font-mono text-[13px] break-all" : ""}`}>{v}</dd>
                </div>
              ))}
              {order.review_note && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300 ring-1 ring-red-500/30">
                  <strong>Review note:</strong> {order.review_note}
                </div>
              )}
            </dl>
            <div className="mt-6 space-y-3 border-t border-slate-800 pt-5">
              <div>
                <div className="label">Payment URL</div>
                <div className="flex gap-2">
                  <input readOnly value={paymentUrl} className="input font-mono text-xs" />
                  <CopyButton text={paymentUrl} />
                </div>
              </div>
              {upiIntent && (
                <div>
                  <div className="label">UPI intent</div>
                  <div className="flex gap-2">
                    <input readOnly value={upiIntent} className="input font-mono text-xs" />
                    <CopyButton text={upiIntent} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2 className="card-title">Webhook history</h2><span className="text-xs text-slate-500">Active + archived, newest first</span></div>
            {webhookHistory.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No webhook attempts for this order yet.</p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {webhookHistory.map((l) => (
                  <div key={`${l.storage_tier}-${l.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="font-mono text-[13px] text-slate-200">{l.event}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{l.storage_tier === "archive" ? "archived" : "active"}</span>
                      <span>attempt {l.attempt}</span>
                      <span>{l.response_code ? `HTTP ${l.response_code}` : "no response"}</span>
                      <StatusPill status={l.success ? "delivered" : "failed"} label={l.success ? "delivered" : "failed"} />
                      <span>{fmtDateTime(l.created_at)}</span>
                    </span>
                    {l.error_label && <span className="w-full text-xs text-red-400">{l.error_label}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {isReview && !readOnly && (
            <>
              <div className="card p-5">
                <h2 className="card-title">Approve UTR</h2>
                <p className="mt-1 text-xs text-slate-500">Customer submitted UTR <span className="font-mono text-slate-300">{order.customer_utr}</span> on {fmtDateTime(order.utr_submitted_at)}.</p>
                <div className="mt-4"><ApproveUtrForm orderNo={order.order_no} amount={String(order.amount)} /></div>
              </div>
              <div className="card p-5">
                <h2 className="card-title">Reject UTR</h2>
                <div className="mt-4"><RejectUtrForm orderNo={order.order_no} /></div>
              </div>
            </>
          )}
          <div className="card p-5">
            <h2 className="card-title">Status timeline</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex justify-between gap-3"><span className="text-slate-400">Created</span><span className="text-slate-200">{fmtDateTime(order.created_at)}</span></li>
              {order.utr_submitted_at && <li className="flex justify-between gap-3"><span className="text-slate-400">UTR submitted</span><span className="text-slate-200">{fmtDateTime(order.utr_submitted_at)}</span></li>}
              {order.paid_at && <li className="flex justify-between gap-3"><span className="text-slate-400">Paid</span><span className="text-slate-200">{fmtDateTime(order.paid_at)}</span></li>}
              <li className="flex justify-between gap-3"><span className="text-slate-400">Current status</span><StatusPill status={order.status} /></li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Merchant-side manual payment confirmation is disabled. Use provider verification or administrator review —
              a payment is never marked paid from this page alone.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
