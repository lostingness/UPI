import { AppShell } from "@/components/layout";
import { CreateOrderForm } from "@/components/create-order-form";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getAccountsWithUsage, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

// Round 8: landing design system on the creation flow — the form card
// keeps the same CreateOrderForm (logic untouched); beside it, a
// "What happens next" rail in the landing's language (mono eyebrow,
// numbered steps, Bricolage headline from AppShell). The rail copy is
// factual: it restates the expiry + verification rules that already
// sat under the form. No behaviour change.
const NEXT_STEPS: [string, string][] = [
  ["Share the link", "Send the payment link or QR to your customer — any UPI app can pay it."],
  ["Customer pays", "They pay on the hosted checkout page with GPay, PhonePe, Paytm or BHIM."],
  ["Provider verifies", "The order is marked paid only when the provider confirms it, or when you approve a submitted UTR."],
];

export default async function NewOrderPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/orders/new");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/orders/new" title="New payment link" subtitle="Create a payment link for a customer.">
        <DbNotConfigured context="Creating an order needs the database." />
      </AppShell>
    );
  }
  const accounts = await getAccountsWithUsage(user.id);
  return (
    <AppShell user={user} active="/orders/new" title="New payment link" subtitle="Create a payment link for a customer.">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card p-6 sm:p-8">
          <CreateOrderForm accounts={accounts.map((a) => ({ id: Number(a.id), label: String(a.label), provider: String(a.provider), is_active: Boolean(a.is_active) }))} />
        </div>
        <aside aria-label="What happens next" className="card animate-rise p-6" style={{ "--d": "120ms" } as React.CSSProperties}>
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent-text)]">What happens next</p>
          <ol className="mt-4 space-y-0">
            {NEXT_STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4 border-t border-[var(--border)] py-4 first:border-t-0 first:pt-0 last:pb-0">
                <span className="font-mono text-sm font-medium tabular-nums text-[var(--accent-text)]">0{i + 1}</span>
                <div>
                  <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
            The link expires 15 minutes after creation (configurable via GATEWAY_ORDER_EXPIRY_MINUTES).
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
