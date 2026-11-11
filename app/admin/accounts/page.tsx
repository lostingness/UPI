import { AdminShell } from "@/components/admin-shell";
import { EmptyState, fmtDateTime } from "@/components/ui";
import { listAllAccounts } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const accounts = await listAllAccounts();
  return (
    <AdminShell active="/admin/accounts" title="All payment accounts" subtitle="Every payment account from every merchant. Credentials are never shown." next="/admin/accounts">
      {() => (
        <>
          {accounts.length === 0 ? (
            <div className="card"><EmptyState title="No payment accounts yet" hint="Merchants have not added any payment accounts." /></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">Account</th><th className="th">Merchant</th><th className="th">Provider</th>
                    <th className="th">UPI ID</th><th className="th">Daily limit</th><th className="th">Status</th><th className="th">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {accounts.map((a) => (
                    <tr key={String(a.id)} className="hover:bg-slate-800/40">
                      <td className="td font-semibold text-slate-100">{String(a.label)}{a.is_default ? " ★" : ""}</td>
                      <td className="td">
                        <div className="text-slate-200">{String(a.merchant_name ?? "—")}</div>
                        <div className="text-xs text-slate-500">{String(a.merchant_email ?? "")}</div>
                      </td>
                      <td className="td text-slate-400">{String(a.provider)}</td>
                      <td className="td font-mono text-[13px] text-slate-300">{a.upi_id ? String(a.upi_id) : "—"}</td>
                      <td className="td tabular-nums">{a.daily_limit ? `₹${Number(a.daily_limit).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="td">{a.is_active ? <span className="text-emerald-300">Active</span> : <span className="text-slate-500">Disabled</span>}</td>
                      <td className="td whitespace-nowrap text-slate-500">{fmtDateTime(String(a.created_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Showing up to 100 accounts, newest first. Credentials are stored encrypted and are never displayed to anyone, including admins.</p>
        </>
      )}
    </AdminShell>
  );
}
