// Manual payment-link form — port of orders/create.blade.php.
// Posts to POST /api/orders, which authenticates the logged-in merchant by
// session cookie (no API key needed here; the secret never reaches the
// browser). On success the new order_id routes to the order detail page.
//
// Round 8 restyle (presentation ONLY — amounts, order methods, account
// selection, validation and the API call are untouched): landing design
// system — Bricolage Grotesque display type for the live preview, the
// landing's mono eyebrow + numbered-step language, staggered rise-in
// entrances, and the btn-accent landing CTA. The Link preview card below
// is live: it reads the same state the submit sends (amount, method,
// account) and states only what is known before creation — for Unique
// Amount the exact paise are assigned at creation, so no payable amount
// is invented here.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Equal, Hash } from "lucide-react";
import { FieldError, FormMessage, useApiForm } from "@/components/forms";
import { unlockAudio } from "@/lib/sounds";
import { playOrderCreatedMp3, unlockMp3Audio } from "@/lib/mp3-sounds";

export function CreateOrderForm({ accounts }: { accounts: { id: number; label: string; provider: string; is_active: boolean }[] }) {
  const router = useRouter();
  const form = useApiForm<{ order_id: string }>();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  // Round 7: per-order QR method — Unique Amount is the platform default.
  const [method, setMethod] = useState<"unique" | "normal">("unique");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [note, setNote] = useState("");
  const amt = Number(amount);
  const preview = Number.isFinite(amt) && amt > 0 ? `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₹0.00";
  const accountLabel =
    accountId === ""
      ? "Auto — rotation picks an active account"
      : (accounts.find((a) => a.id === Number(accountId))?.label ?? "Selected account");

  return (
    <form
      className="animate-rise space-y-5"
      style={{ "--d": "80ms" } as React.CSSProperties}
      onSubmit={async (e) => {
        e.preventDefault();
        // Round 5: the submit click IS a user gesture — unlock audio here
        // so the sound below (which plays after the server round-trip) can
        // sound. The sound itself fires only on a confirmed 201.
        unlockAudio();
        unlockMp3Audio();
        const res = await form.submit("/api/orders", {
          amount: amt,
          payment_account_id: accountId ? Number(accountId) : null,
          customer_name: customerName || null,
          customer_mobile: customerMobile || null,
          note: note || null,
          qr_method: method,
        });
        if (res.ok && res.data?.order_id) {
          // Round 7: MP3 order-created sound (falls back to the synth
          // tick when the file cannot play).
          playOrderCreatedMp3();
          router.push(`/orders/${res.data.order_id}`);
        }
      }}
    >
      <FormMessage message={form.message} ok={false} />
      <div>
        <label htmlFor="o-amount" className="label">Amount (₹)</label>
        <input id="o-amount" type="number" min="1" max="100000" step="0.01" required placeholder="e.g. 499"
          className="input text-lg font-medium tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <p className="help">You are charging <strong className="text-[var(--text)]">{preview}</strong> · ₹1 – ₹1,00,000</p>
        <FieldError errors={form.errors} name="amount" />
      </div>
      <div>
        <span className="label" id="o-method-label">Payment amount</span>
        <div role="radiogroup" aria-labelledby="o-method-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            {
              value: "unique" as const,
              title: "Unique Amount",
              desc: "Each order gets a unique paise amount, e.g. ₹500 → ₹500.01, so payments match automatically",
              icon: <Hash className="h-4 w-4" aria-hidden="true" />,
              tag: "Recommended",
            },
            {
              value: "normal" as const,
              title: "Normal Amount",
              desc: "The exact amount you enter, no extra paise",
              icon: <Equal className="h-4 w-4" aria-hidden="true" />,
              tag: null,
            },
          ]).map((opt) => {
            const selected = method === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMethod(opt.value)}
                className={`rounded-xl p-3 text-left ring-1 transition ${
                  selected
                    ? "bg-[var(--surface-2)] ring-2 ring-[var(--accent-text)]"
                    : "ring-[var(--border)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                  <span
                    aria-hidden="true"
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ${
                      selected ? "ring-[var(--accent-text)]" : "ring-[var(--faint)]"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-[var(--accent-text)]" />}
                  </span>
                  <span className="text-[var(--accent-text)]">{opt.icon}</span>
                  {opt.title}
                  {opt.tag && (
                    <span className="ml-auto rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      {opt.tag}
                    </span>
                  )}
                  {selected && !opt.tag && <span className="ml-auto rounded-full bg-[var(--accent-text)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Selected</span>}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-[var(--muted)]">{opt.desc}</span>
              </button>
            );
          })}
        </div>
        <p className="help">
          {method === "unique"
            ? "The customer pays a few paise above the amount — the exact paise are assigned when the link is created."
            : "The customer pays exactly the amount above."}
        </p>
        <FieldError errors={form.errors} name="qr_method" />
      </div>
      <div>
        <label htmlFor="o-account" className="label">Payment account</label>
        <select id="o-account" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Auto — rotate between active accounts</option>
          {accounts.filter((a) => a.is_active).map((a) => (
            <option key={a.id} value={a.id}>{a.label} ({a.provider})</option>
          ))}
        </select>
        <p className="help">Only active accounts are listed. Leave empty to let rotation pick one.</p>
        <FieldError errors={form.errors} name="payment_account_id" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="o-name" className="label">Customer name</label>
          <input id="o-name" maxLength={100} placeholder="Optional" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <FieldError errors={form.errors} name="customer_name" />
        </div>
        <div>
          <label htmlFor="o-mobile" className="label">Customer mobile</label>
          <input id="o-mobile" maxLength={20} placeholder="Optional" className="input" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} />
          <FieldError errors={form.errors} name="customer_mobile" />
        </div>
      </div>
      <div>
        <label htmlFor="o-note" className="label">Note</label>
        <input id="o-note" maxLength={50} placeholder="Optional — shown on the checkout page" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        <FieldError errors={form.errors} name="note" />
      </div>

      {/* Live link preview — same landing hero-preview language (mono
          eyebrow, display amount, receipt rows). Reads only the state
          above; nothing here is sent to the server or invented. */}
      <aside aria-label="Link preview" className="rounded-xl bg-[var(--surface-2)] p-4 ring-1 ring-[var(--border)]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-text)]">Link preview</p>
          <span className="rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Live</span>
        </div>
        <p className="mt-3 font-display text-3xl font-medium tracking-[-0.02em] text-[var(--text)]">{preview}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2">
            <dt className="text-[var(--faint)]">Payable</dt>
            <dd className="text-right font-medium text-[var(--text)]">
              {method === "unique" ? "A few paise above — assigned at creation" : `${preview} exactly`}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2">
            <dt className="text-[var(--faint)]">Account</dt>
            <dd className="text-right font-medium text-[var(--text)]">{accountLabel}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2">
            <dt className="text-[var(--faint)]">Expires</dt>
            <dd className="text-right font-medium text-[var(--text)]">15 minutes after creation</dd>
          </div>
        </dl>
      </aside>

      {/* Round 8: btn-accent — the landing CTA token (white on
          --accent-strong is 5.18:1, AA in both themes). */}
      <button className="btn btn-accent w-full py-2.5" disabled={form.pending}>
        {form.pending ? "Creating…" : "Create payment link →"}
      </button>
    </form>
  );
}
