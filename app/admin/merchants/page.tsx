import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { MerchantToggleButton } from "@/components/admin-forms";
import { Avatar, EmptyState, fmtDate, inr } from "@/components/ui";
import { listAdminMerchants } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function AdminMerchantsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  return (
    <AdminShell active="/admin/merchants" title="Merchants" subtitle="Every merchant account, with live order counts and paid totals." next="/admin/merchants">
      {() => <MerchantsBody page={page} />}
    </AdminShell>
  );
}

// Data is fetched here, inside AdminShell's children callback — i.e. only
// AFTER the admin + password-confirm gate has passed. Fetching before
// AdminShell would run admin queries (and audit writes) for unconfirmed or
// signed-out visitors.
async function MerchantsBody({ page }: { page: number }) {
  const { merchants } = await listAdminMerchants(page);
  return (
        <>
          {merchants.length === 0 ? (
            <div className="card"><EmptyState title="No merchants yet" hint="Merchant accounts created via registration or by an admin will appear here." /></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="th">Merchant</th><th className="th">Live orders</th><th className="th">Paid</th>
                    <th className="th">Paid amount</th><th className="th">Joined</th><th className="th">Status</th><th className="th"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {merchants.map((m) => (
                    <tr key={String(m.id)} className="hover:bg-slate-800/40">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <Avatar name={String(m.business_name ?? m.name)} className="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{String(m.business_name ?? m.name)}</div>
                            <div className="truncate text-xs text-slate-500">{String(m.email)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td tabular-nums">{String(m.live_order_count)}</td>
                      <td className="td tabular-nums">{String(m.paid_count)}</td>
                      <td className="td font-medium text-slate-100 tabular-nums">{inr(Number(m.paid_amount ?? 0))}</td>
                      <td className="td whitespace-nowrap text-slate-500">{fmtDate(String(m.created_at))}</td>
                      <td className="td">{m.is_active ? <span className="text-emerald-300">Active</span> : <span className="text-slate-500">Disabled</span>}</td>
                      <td className="td text-right">
                        <MerchantToggleButton id={Number(m.id)} isActive={Boolean(m.is_active)} email={String(m.email)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {page} · 25 per page</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={`/admin/merchants?page=${page - 1}`} className="btn btn-secondary btn-sm">← Previous</Link>}
              {merchants.length === 25 && <Link href={`/admin/merchants?page=${page + 1}`} className="btn btn-secondary btn-sm">Next →</Link>}
            </span>
          </div>
        </>
  );
}
