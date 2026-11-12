// Landing hero "Try a demo payment" CTA (Round 8). Logged-in merchants:
// one click creates a ₹10.00 demo (sandbox) order via POST /api/demo/orders
// and navigates to its /demo/pay/TST… page. Logged-out visitors: the same
// button goes to /login — a demo order needs a merchant to own it.
// The DEMO tag is part of the button, so the option is labelled DEMO on
// the landing page itself, not just on the page it opens.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postApi } from "@/components/api";
import type { DemoOrderResult } from "@/lib/demo";

export function DemoTag() {
  return (
    <span className="ml-2 shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">
      Demo
    </span>
  );
}

export function DemoCta({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!loggedIn) {
    return (
      <a href="/login" className="hbtn-ghost" aria-label="Try a demo payment — log in first">
        <span>Try a demo payment</span>
        <DemoTag />
      </a>
    );
  }
  return (
    <span className="relative inline-flex flex-col">
      <button
        type="button"
        className="hbtn-ghost cursor-pointer"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await postApi<DemoOrderResult>("/api/demo/orders", {});
          setPending(false);
          if (res.ok && res.data?.payment_url) router.push(res.data.payment_url);
          else setError(res.message ?? "Could not create a demo link — try again from the dashboard.");
        }}
      >
        <span>{pending ? "Creating demo link…" : "Try a demo payment"}</span>
        <DemoTag />
      </button>
      {error && (
        <span role="alert" className="absolute left-0 top-full mt-2 w-max max-w-[80vw] whitespace-normal text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
