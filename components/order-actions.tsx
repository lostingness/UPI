// Order detail actions (client) — port of orders/show.blade.php forms:
// recheck, approve-UTR, reject-UTR. Never marks paid from the frontend:
// approve-UTR is a merchant review decision sent to the server, which
// re-verifies amount + bank UTR before marking paid.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";

export function RecheckButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const form = useApiForm<{ status: string }>();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className="btn btn-secondary" disabled={form.pending}
        onClick={async () => {
          const res = await form.submit(`/api/orders/${orderNo}/recheck`, {});
          if (res.ok) router.refresh();
        }}
      >
        {form.pending ? "Checking…" : "Recheck status"}
      </button>
      {form.message && <span className="text-xs text-red-700 dark:text-red-400">{form.message}</span>}
      {form.ok && form.data && <span className="text-xs text-emerald-700 dark:text-emerald-300">Status: {form.data.status}</span>}
    </span>
  );
}

export function ApproveUtrForm({ orderNo, amount }: { orderNo: string; amount: string }) {
  const router = useRouter();
  const form = useApiForm();
  const [bankUtr, setBankUtr] = useState("");
  const [receivedAmount, setReceivedAmount] = useState(amount);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit(`/api/orders/${orderNo}/approve-utr`, {
          bank_utr: bankUtr, received_amount: Number(receivedAmount),
        });
        if (res.ok) router.refresh();
      }}
    >
      <FormMessage message={form.message} ok={form.ok} />
      <p className="text-xs text-[var(--muted)]">
        Approve only after matching this UTR and the exact amount in your bank statement.
        The server re-verifies before the order is marked paid.
      </p>
      <div>
        <label htmlFor="bank-utr" className="label">Bank UTR (12 digits)</label>
        <input id="bank-utr" inputMode="numeric" autoComplete="off" maxLength={14} required
          placeholder="e.g. 412345678901" className="input font-monor"
          value={bankUtr} onChange={(e) => setBankUtr(e.target.value)} />
        <FieldError errors={form.errors} name="bank_utr" />
      </div>
      <div>
        <label htmlFor="received-amount" className="label">Amount received (₹)</label>
        <input id="received-amount" type="number" min="0.01" step="0.01" required
          className="input" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} />
        <FieldError errors={form.errors} name="received_amount" />
      </div>
      <button className="btn btn-success w-full" disabled={form.pending}>
        {form.pending ? "Approving…" : "Approve UTR & mark paid"}
      </button>
    </form>
  );
}

export function RejectUtrForm({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const form = useApiForm();
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await form.submit(`/api/orders/${orderNo}/reject-utr`, { reason: reason || undefined });
        if (res.ok) router.refresh();
      }}
    >
      <FormMessage message={form.message} ok={form.ok} />
      <div>
        <label htmlFor="reject-reason" className="label">Reason (optional, max 150 chars)</label>
        <input id="reject-reason" maxLength={150} placeholder="e.g. Amount does not match" className="input"
          value={reason} onChange={(e) => setReason(e.target.value)} />
        <FieldError errors={form.errors} name="reason" />
      </div>
      <button className="btn btn-danger w-full" disabled={form.pending}>
        {form.pending ? "Rejecting…" : "Reject UTR"}
      </button>
      <p className="text-xs text-[var(--muted)]">
        Rejecting re-pends the order with a fresh expiry (or expires it when attempts are exhausted) and tells the customer to try again.
      </p>
    </form>
  );
}
