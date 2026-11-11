// POST /logout behaviour: clears the session via the API, then lands on /login.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GuestShell } from "@/components/layout";
import { postApi } from "@/components/api";

export default function LogoutPage() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    postApi("/api/auth/logout", {}).finally(() => {
      if (!alive) return;
      setDone(true);
      router.push("/login");
      router.refresh();
    });
    return () => { alive = false; };
  }, [router]);
  return (
    <GuestShell title="Logging out" subtitle={done ? "You have been logged out." : "Signing you out…"}>
      <p className="text-sm text-[var(--muted)]">
        {done ? "Redirecting to the login page…" : "Please wait."}
      </p>
    </GuestShell>
  );
}
