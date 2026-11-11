import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <GuestShell title="Log in" subtitle="Log in to your merchant dashboard.">
      <LoginForm />
      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        New to UPI Gateway?{" "}
        <Link href="/register" className="font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">Create a free account</Link>
      </p>
    </GuestShell>
  );
}
