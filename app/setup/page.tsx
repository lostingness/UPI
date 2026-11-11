import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { SetupWizard } from "@/components/setup-form";
import { getInstallState } from "@/components/server-data";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const sp = await searchParams;
  const { installed, databaseConfigured } = await getInstallState();

  if (sp.done === "1" || installed) {
    return (
      <GuestShell title={installed ? "Already set up" : "You're ready to go"} subtitle={installed ? "This gateway already has an admin account." : "Your admin account has been created."}>
        <div className="rounded-lg bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
          Setup is complete. Log in with the admin account you just created to open the dashboard.
        </div>
        <Link href="/login" className="btn btn-primary mt-6 w-full py-2.5">Log in →</Link>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Next: add a payment account, set your webhook URL, and create your first payment link.
        </p>
      </GuestShell>
    );
  }

  return (
    <GuestShell title="Set up UPI Gateway" subtitle="First run: connect the database and create the first admin.">
      <SetupWizard databaseConfigured={databaseConfigured} installed={installed} />
      <p className="mt-8 text-center text-xs text-[var(--muted)]">
        Already installed? <Link href="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">Log in</Link>
      </p>
    </GuestShell>
  );
}
