// Small client bits used by the layouts.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postApi } from "./api";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={compact ? "btn btn-secondary btn-sm" : "btn btn-secondary w-full"}
      onClick={async () => {
        setBusy(true);
        await postApi("/api/auth/logout", {});
        router.push("/login");
        router.refresh();
      }}
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
