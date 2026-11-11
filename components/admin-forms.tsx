// Admin actions (client) — manual payment override, verification-lease
// recovery, merchant toggle, webhook retry/restore. Every one of these is
// audited server-side; the forms only collect the required evidence.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";
import { postApi } from "@/components/api";

export function ManualOverrideForm({ orderNo, amount }: { orderNo: string; amount: string }) {
  const router = useRouter();
  const form = useApiForm();
  const [v, setV] = useState({ amount, verification_reference: "", reason: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit(`/api/admin/orders/${orderNo}/manual-payment-override`, {
          amount: Number(v.amount), verification_reference: v.verification_reference, reason: v.reason,
        });
        if (res.ok) router.refresh();
      }}
    >
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-300">Override applied — the order is now paid and the override is recorded in the audit log.</p>}
      <div className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-300 ring-1 ring-amber-500/30">
        Manual override marks the order paid without a provider response. Use it only with independent evidence
        (bank statement / provider dashboard). The amount must equal the order amount, and a reference + reason (20–500 chars) are required.
        This action is written to the audit log with your identity.
      </div>
      <div>
        <label htmlFor="mo-amount" className="label">Amount (₹, must equal order amount)</label>
        <input id="mo-amount" type="number" min="0.01" step="0.01" required className="input" value={v.amount} onChange={set("amount")} />
        <FieldError errors={form.errors} name="amount" />
      </div>
      <div>
        <label htmlFor="mo-ref" className="label">Verification reference</label>
        <input id="mo-ref" required minLength={6} maxLength={80} placeholder="e.g. BANK-STMT-2026-11-11-042" className="input font-mono text-[13px]" value={v.verification_reference} onChange={set("verification_reference")} />
        <p className="help">6–80 chars, letters/digits/_/- only.</p>
        <FieldError errors={form.errors} name="verification_reference" />
      </div>
      <div>
        <label htmlFor="mo-reason" className="label">Reason</label>
        <textarea id="mo-reason" required minLength={20} maxLength={500} rows={3}
          placeholder="What evidence did you check, and why is provider verification unavailable?"
          className="input" value={v.reason} onChange={set("reason")} />
        <FieldError errors={form.errors} name="reason" />
      </div>
      <button className="btn btn-danger w-full" disabled={form.pending}>
        {form.pending ? "Applying override…" : "Mark paid by manual override"}
      </button>
    </form>
  );
}

export function LeaseRecoveryForm() {
  const router = useRouter();
  const form = useApiForm<{ recovered: boolean }>();
  const [v, setV] = useState({ order_no: "", generation: "", operator: "", reason: "", execution_token: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit("/api/admin/verification-lease/recover", {
          order_no: v.order_no, generation: Number(v.generation), operator: v.operator,
          reason: v.reason, execution_token: v.execution_token || undefined,
        });
        if (res.ok) router.refresh();
      }}
    >
      <FormMessage message={form.message} ok={form.ok} />
      {form.ok && <p className="text-sm text-emerald-300">Lease recovered — the order can be verified again. The recovery is recorded in the audit table.</p>}
      <p className="text-xs leading-relaxed text-slate-500">
        Recover an <em>expired</em> verification lease so a stuck order can be checked again. Only recover a lease after you are sure
        the process that held it is stopped — on Vercel there is no process identity, so the check is: lease expired + generation matches.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lr-order" className="label">Order no</label>
          <input id="lr-order" required className="input font-mono" value={v.order_no} onChange={set("order_no")} />
          <FieldError errors={form.errors} name="order_no" />
        </div>
        <div>
          <label htmlFor="lr-gen" className="label">Generation</label>
          <input id="lr-gen" type="number" required min="0" className="input" value={v.generation} onChange={set("generation")} />
          <FieldError errors={form.errors} name="generation" />
        </div>
      </div>
      <div>
        <label htmlFor="lr-operator" className="label">Operator</label>
        <input id="lr-operator" required placeholder="Your name / handle" className="input" value={v.operator} onChange={set("operator")} />
        <FieldError errors={form.errors} name="operator" />
      </div>
      <div>
        <label htmlFor="lr-reason" className="label">Reason</label>
        <textarea id="lr-reason" required rows={2} className="input" value={v.reason} onChange={set("reason")} />
        <FieldError errors={form.errors} name="reason" />
      </div>
      <button className="btn btn-danger" disabled={form.pending}>{form.pending ? "Recovering…" : "Recover lease"}</button>
    </form>
  );
}

export function MerchantToggleButton({ id, isActive, email }: { id: number; isActive: boolean; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className="btn btn-secondary btn-sm" disabled={busy}
        onClick={async () => {
          if (!window.confirm(`${isActive ? "Disable" : "Enable"} merchant ${email}? This is audit-logged.`)) return;
          setBusy(true); setError(null);
          const res = await postApi(`/api/admin/merchants/${id}/toggle`, {});
          setBusy(false);
          if (res.ok) router.refresh();
          else setError(res.message ?? "Request failed");
        }}
      >
        {busy ? "…" : isActive ? "Disable" : "Enable"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}

export function WebhookEventActions({ eventId, status, hasPayload }: { eventId: string; status: string; hasPayload: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, path: string) => {
    setBusy(key); setError(null);
    const res = await postApi(path, {});
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.message ?? "Request failed");
  };
  const delivered = status === "delivered";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex gap-2">
        <button className="btn btn-secondary btn-sm" disabled={delivered || !!busy}
          onClick={() => run("retry", `/api/admin/webhooks/${eventId}/retry`)}>
          {busy === "retry" ? "…" : "Retry"}
        </button>
        {!hasPayload && (
          <button className="btn btn-secondary btn-sm" disabled={!!busy}
            onClick={() => run("restore", `/api/admin/webhooks/${eventId}/restore-payload`)}>
            {busy === "restore" ? "…" : "Restore payload"}
          </button>
        )}
      </span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
