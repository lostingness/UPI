import Link from "next/link";
import { GuestShell } from "@/components/layout";
import { LoginForm } from "@/components/auth-forms";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <GuestShell title="Welcome back" subtitle="Log in to your merchant dashboard.">
      <LoginForm />
      <p className="mt-8 text-center text-sm text-slate-500">
        New to UPI Gateway?{" "}
        <Link href="/register" className="font-semibold text-brand-400 hover:text-brand-300">Create a free account</Link>
      </p>
    </GuestShell>
  );
}
