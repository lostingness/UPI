import { AppShell } from "@/components/layout";
import { CreateOrderForm } from "@/components/create-order-form";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getAccountsWithUsage, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

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
      <div className="card max-w-2xl p-6">
        <CreateOrderForm accounts={accounts.map((a) => ({ id: Number(a.id), label: String(a.label), provider: String(a.provider), is_active: Boolean(a.is_active) }))} />
      </div>
      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
        The link expires {`15`} minutes after creation (configurable via GATEWAY_ORDER_EXPIRY_MINUTES). The customer pays on the hosted checkout page;
        the order is marked paid only when the provider confirms it, or when you approve a submitted UTR.
      </p>
    </AppShell>
  );
}
