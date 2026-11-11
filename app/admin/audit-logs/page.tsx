import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { EmptyState, fmtDateTime } from "@/components/ui";
import { listAuditLogs } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { logs } = await listAuditLogs(page);
  return (
    <AdminShell active="/admin/audit-logs" title="Audit logs" subtitle="Every admin action, newest first. Append-only — audit entries are never edited or deleted." next="/admin/audit-logs">
      {() => (
        <>
          {logs.length === 0 ? (
            <div className="card"><EmptyState title="No audit events yet" hint="Merchant toggles, order views, manual overrides and lease recoveries are recorded here." /></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">When</th><th className="th">Action</th><th className="th">Subject</th><th className="th">Admin</th><th className="th">IP</th><th className="th">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {logs.map((l) => (
                    <tr key={String(l.id)} className="hover:bg-slate-800/40">
                      <td className="td whitespace-nowrap text-slate-400">{fmtDateTime(String(l.created_at))}</td>
                      <td className="td font-mono text-[13px] font-semibold text-slate-100">{String(l.action)}</td>
                      <td className="td text-slate-400">{l.subject_type ? `${String(l.subject_type)} #${String(l.subject_id ?? "")}` : "—"}</td>
                      <td className="td text-slate-400">{l.actor_admin_id ? `#${String(l.actor_admin_id)}` : "—"}</td>
                      <td className="td font-mono text-xs text-slate-500">{l.ip ? String(l.ip) : "—"}</td>
                      <td className="td max-w-72 truncate font-mono text-xs text-slate-500" title={typeof l.meta === "string" ? l.meta : JSON.stringify(l.meta ?? {})}>
                        {typeof l.meta === "string" ? l.meta : JSON.stringify(l.meta ?? {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} · 50 per page</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={`/admin/audit-logs?page=${page - 1}`} className="btn btn-secondary btn-sm">← Previous</Link>}
              {logs.length === 50 && <Link href={`/admin/audit-logs?page=${page + 1}`} className="btn btn-secondary btn-sm">Next →</Link>}
            </span>
          </div>
        </>
      )}
    </AdminShell>
  );
}
