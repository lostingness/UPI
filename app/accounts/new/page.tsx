import { AppShell } from "@/components/layout";
import { CreateAccountForm } from "@/components/account-forms";
import { DbNotConfigured } from "@/components/ui";
import { dbConfigured, getSessionSafe, requireUser } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const session = await getSessionSafe();
  const user = requireUser(session, "/accounts/new");
  if (!dbConfigured()) {
    return (
      <AppShell user={user} active="/accounts" title="Add payment account" subtitle="Connect a UPI ID or a payment gateway.">
        <DbNotConfigured context="Adding an account needs the database." />
      </AppShell>
    );
  }
  return (
    <AppShell user={user} active="/accounts" title="Add payment account" subtitle="Connect a UPI ID or a payment gateway.">
      <div className="card max-w-2xl p-6">
        <CreateAccountForm />
      </div>
      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
        Credentials are stored encrypted in the database and are never shown again. The first account you add becomes your default.
        Hosted gateways (PhonePe PG, Paytm PG) send customers to the provider&apos;s secure checkout; manual UPI and Paytm for Business are verified by the gateway.
      </p>
    </AppShell>
  );
}
