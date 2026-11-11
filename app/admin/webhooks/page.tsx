import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { WebhookEventActions } from "@/components/admin-forms";
import { EmptyState, StatusPill, fmtDateTime } from "@/components/ui";
import { listOutbox } from "@/components/server-data";

export const dynamic = "force-dynamic";

const STATUSES = ["", "pending", "delivered", "failed", "blocked"];

export default async function AdminWebhooksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? (sp.status ?? "") : "";
  const events = await listOutbox(status);
  return (
    <AdminShell active="/admin/webhooks" title="Webhook outbox" subtitle="Every webhook delivery, pending / failed / delivered. Exactly-once-ish, sequenced, claim/lease based." next="/admin/webhooks">
      {() => (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Link key={s || "all"} href={s ? `/admin/webhooks?status=${s}` : "/admin/webhooks"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${status === s ? "bg-brand-600/20 text-brand-300 ring-brand-500/40" : "bg-slate-900 text-slate-400 ring-slate-800 hover:text-slate-200"}`}>
                {s === "" ? "All" : s}
              </Link>
            ))}
          </div>
          {events.length === 0 ? (
            <div className="card"><EmptyState title="No webhook events" hint="Outbox events appear here when orders change status." /></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">Event</th><th className="th">Order</th><th className="th">Status</th>
                    <th className="th">Attempts</th><th className="th">Available</th><th className="th">Last error</th><th className="th"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {events.map((e) => (
                    <tr key={String(e.id)} className="hover:bg-slate-800/40">
                      <td className="td">
                        <div className="font-mono text-[13px] text-slate-200">{String(e.event)}</div>
                        <div className="font-mono text-xs text-slate-500">{String(e.event_id ?? "")} · seq {String(e.event_sequence ?? "")}</div>
                      </td>
                      <td className="td font-mono text-[13px] text-slate-300">{String(e.order_no ?? e.order_id ?? "—")}</td>
                      <td className="td"><StatusPill status={String(e.status)} /></td>
                      <td className="td tabular-nums">{String(e.dispatch_attempts ?? 0)}</td>
                      <td className="td whitespace-nowrap text-slate-500">{fmtDateTime(String(e.available_at ?? e.created_at))}</td>
                      <td className="td max-w-56 truncate text-xs text-red-400" title={String(e.last_error ?? "")}>{e.last_error ? String(e.last_error) : "—"}</td>
                      <td className="td text-right">
                        <WebhookEventActions eventId={String(e.event_id)} status={String(e.status)} hasPayload={e.payload !== null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Retry resets an undelivered event to pending (delivered events and actively-claimed events are refused).
            If a payload was offloaded to the archive, restore it first. Delivery is HMAC-SHA256 signed (<code className="kbd">t=…,v1=…</code>, 5-minute tolerance).
          </p>
        </>
      )}
    </AdminShell>
  );
}
