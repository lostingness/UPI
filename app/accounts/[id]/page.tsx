import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout";
import { CopyButton } from "@/components/forms";
import { AccountActions, LimitForm } from "@/components/account-forms";
import { DbNotConfigured, StatusPill, fmtDateTime, inr } from "@/components/ui";
import { dbConfigured, getAccountsWithUsage, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  manual: "Manual UPI", paytm_business: "Paytm for Business", paytm_pg: "Paytm PG", phonepe_pg: "PhonePe PG",
};

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionSafe();
  const user = requireUser(session, `/accounts/${id}`);
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/accounts" title="Payment account" subtitle="Account detail.">
        <DbNotConfigured context="Account detail needs the database." />
      </AppShell>
    );
  }
  const accounts = await getAccountsWithUsage(user.id);
  const a = accounts.find((x) => String(x.id) === id);
  if (!a) notFound();
  return (
    <AppShell user={user} active="/accounts" title={String(a.label)} subtitle={PROVIDER_LABEL[String(a.provider)] ?? String(a.provider)}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={a.is_active ? "active" : "disabled"} label={a.is_active ? "Active" : "Disabled"} />
            {a.is_default && <StatusPill status="live" label="Default" />}
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Provider", PROVIDER_LABEL[String(a.provider)] ?? String(a.provider)],
              ["UPI ID", a.upi_id ? String(a.upi_id) : "—"],
              ["Payee name", a.payee_name ? String(a.payee_name) : "—"],
              ["Daily limit", a.daily_limit ? inr(Number(a.daily_limit)) : "No limit"],
              ["Used today (IST)", inr(Number(a.used_today ?? 0))],
              ["Remaining today", a.remaining_today === null || a.remaining_today === undefined ? "No limit" : inr(Number(a.remaining_today))],
              ["Created", fmtDateTime(String(a.created_at))],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">{k}</dt>
                <dd className="min-w-0 text-right font-mono text-[13px] text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
          {a.upi_id && (
            <div className="mt-5 flex gap-2">
              <input readOnly value={String(a.upi_id)} className="input font-mono text-xs" />
              <CopyButton text={String(a.upi_id)} />
            </div>
          )}
          <div className="mt-5 rounded-lg bg-slate-800/60 px-4 py-3 text-xs leading-relaxed text-slate-400 ring-1 ring-slate-800">
            Credentials for this account are stored encrypted and are never displayed — not even to you.
            To change them, delete this account and create a new one. Deleting is refused while any orders exist for it; disable it instead.
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="card-title">Daily limit</h2>
            <div className="mt-4"><LimitForm id={Number(a.id)} dailyLimit={a.daily_limit ? String(a.daily_limit) : null} /></div>
          </div>
          <div className="card p-6">
            <h2 className="card-title">Actions</h2>
            <div className="mt-4"><AccountActions id={Number(a.id)} isActive={Boolean(a.is_active)} isDefault={Boolean(a.is_default)} /></div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Disabling stops new orders routing to this account; existing pending orders are unaffected.
              Making an account default clears the default flag from your other accounts.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
