import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { StatusPill, fmtDateTime, inr } from "@/components/ui";
import { getDebuggerDetail, getClientIp } from "@/components/server-data";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function DebuggerDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const hdrs = await headers();
  const ip = getClientIp(new Request("http://localhost", { headers: hdrs }));
  return (
    <AdminShell active="/admin/transaction-debugger" title={`Debugger · ${orderNo}`} subtitle="Masked PII, sanitised provider error, full timeline. This view is audit-logged." next={`/admin/transaction-debugger/${orderNo}`}>
      {(admin) => <DebuggerBody orderNo={orderNo} adminId={admin.id} ip={ip} />}
    </AdminShell>
  );
}

async function DebuggerBody({ orderNo, adminId, ip }: { orderNo: string; adminId: number; ip: string | null }) {
  const d = await getDebuggerDetail(orderNo, adminId, ip);
  if (!d) notFound();
  const { order, merchant, account, providerError, timeline, webhookLogs } = d;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Amount</div>
              <div className="mt-1 text-3xl font-bold tracking-tight text-slate-50 tabular-nums">{inr(Number(order.amount))}</div>
            </div>
            <StatusPill status={order.status} />
          </div>
          <dl className="mt-6 space-y-3 border-t border-slate-800 pt-5 text-sm">
            {([
              ["Order ID", order.order_no, true],
              ["Client order ID", order.client_order_id, true],
              ["Merchant", merchant ? `${merchant.name} (${merchant.email})` : `User #${order.user_id}`, false],
              ["Customer (masked)", order.customer_name ?? "—", false],
              ["Customer email (masked)", order.customer_email ?? "—", false],
              ["Customer mobile (masked)", order.customer_mobile ?? "—", false],
              ["Payment account", account ? `${account.label} (${account.provider})` : "—", false],
              ["Environment", order.environment, false],
              ["UTR", order.utr ?? "—", true],
              ["Submitted UTR", order.customer_utr ?? "—", true],
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
            {providerError && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
                <strong>Provider error (sanitised):</strong> {providerError}
              </div>
            )}
          </dl>
        </div>
        <div className="card">
          <div className="card-header"><h2 className="card-title">Webhook attempts ({webhookLogs.length})</h2></div>
          {webhookLogs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No webhook attempts for this order yet.</p>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {webhookLogs.map((l) => (
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
      <div className="card h-fit p-5">
        <h2 className="card-title">Timeline</h2>
        <ol className="mt-4 space-y-3 border-l-2 border-slate-800 pl-4 text-sm">
          {timeline.map((t, i) => (
            <li key={`${t.event}-${i}`} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-slate-900" />
              <div className="font-mono text-[13px] text-slate-100">{t.event}</div>
              <div className="text-xs text-slate-500">{fmtDateTime(t.at)}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
