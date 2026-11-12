import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { LoginForm } from "@/components/auth-forms";
import { AuthIllustration } from "@/components/auth-illustration";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <GuestShell
      title="Log in"
      subtitle="Log in to your merchant dashboard."
      illustration={<AuthIllustration className="h-auto w-full" />}
      panelTitle="Track every payment."
      panelBody="Create orders in one call, verify UTRs against the bank, and get a signed webhook for every transition — paid, expired, under review or failed."
    >
      <LoginForm />
      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        New to UPI Gateway?{" "}
        <Link href="/register" className="font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">Create a free account</Link>
      </p>
    </GuestShell>
  );
}
