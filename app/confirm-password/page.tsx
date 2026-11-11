import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { ConfirmPasswordForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default function ConfirmPasswordPage() {
  return (
    <GuestShell title="Confirm your password" subtitle="Please re-enter your password to continue.">
      <ConfirmPasswordForm />
      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        <Link href="/dashboard" className="font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">Back to dashboard</Link>
      </p>
    </GuestShell>
  );
}
