import Link from "next/link";
import { AppShell } from "@/components/layout";
import { CopyButton } from "@/components/forms";
import { AccountActions, LimitForm } from "@/components/account-forms";
import { DbNotConfigured, EmptyState, StatusPill, inr } from "@/components/ui";
import { dbConfigured, getAccountsWithUsage, getMerchantSettings, getSessionSafe, requireUser } from "@/components/server-data";
import { RotationForm } from "@/components/settings-forms";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  manual: "Manual UPI", paytm_business: "Paytm for Business", paytm_pg: "Paytm PG", phonepe_pg: "PhonePe PG",
};

export default async function AccountsPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/accounts");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/accounts" title="Payment accounts" subtitle="Where your customers' money goes.">
        <DbNotConfigured context="Payment accounts need the database." />
      </AppShell>
    );
  }
  const [accounts, settings] = await Promise.all([getAccountsWithUsage(user.id), getMerchantSettings(user.id)]);
  return (
    <AppShell
      user={user} active="/accounts" title="Payment accounts"
      subtitle="Where your customers' money goes. Money is never pooled — every payment lands in your own account."
      actions={<Link href="/accounts/new" className="btn btn-primary">+ Add account</Link>}
    >
      <div className="card mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="card-title">Rotation mode</h2>
            <p className="mt-1 text-sm text-slate-400">How the gateway picks an account when an order doesn&apos;t name one.</p>
          </div>
          <RotationForm current={settings?.rotationMode ?? "random"} />
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="card">
          <EmptyState title="No payment accounts yet" hint="Add your UPI ID, Paytm for Business, PhonePe PG or Paytm PG account to start accepting payments.">
            <Link href="/accounts/new" className="btn btn-primary">Add your first account →</Link>
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((a) => (
            <div key={String(a.id)} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium text-slate-100">{String(a.label)}</h2>
                    <StatusPill status={a.is_active ? "active" : "disabled"} label={a.is_active ? "Active" : "Disabled"} />
                    {a.is_default && <StatusPill status="live" label="Default" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{PROVIDER_LABEL[String(a.provider)] ?? String(a.provider)}</p>
                </div>
                <Link href={`/accounts/${a.id}`} className="btn btn-ghost btn-sm shrink-0">Details →</Link>
              </div>
              {a.upi_id && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 px-3 py-2.5">
                  <span className="truncate font-mono text-sm text-slate-200">{String(a.upi_id)}</span>
                  <CopyButton text={String(a.upi_id)} />
                </div>
              )}
              {a.payee_name && <p className="mt-2 text-sm text-slate-400">Payee: {String(a.payee_name)}</p>}
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4 text-sm">
                <div><dt className="text-xs text-slate-500">Used today</dt><dd className="mt-0.5 font-medium text-slate-100 tabular-nums">{inr(Number(a.used_today ?? 0))}</dd></div>
                <div><dt className="text-xs text-slate-500">Remaining</dt><dd className="mt-0.5 font-medium text-slate-100 tabular-nums">{a.remaining_today === null || a.remaining_today === undefined ? "No limit" : inr(Number(a.remaining_today))}</dd></div>
                <div><dt className="text-xs text-slate-500">Daily limit</dt><dd className="mt-0.5 font-medium text-slate-100 tabular-nums">{a.daily_limit ? inr(Number(a.daily_limit)) : "—"}</dd></div>
              </dl>
              <div className="mt-4 border-t border-slate-800 pt-4">
                <AccountActions id={Number(a.id)} isActive={Boolean(a.is_active)} isDefault={Boolean(a.is_default)} />
              </div>
              <div className="mt-4"><LimitForm id={Number(a.id)} dailyLimit={a.daily_limit ? String(a.daily_limit) : null} /></div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
