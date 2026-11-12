// QR settings (client) — self-contained. The settings page renders this
// component; it fetches its own data from /api/settings/qr and
// /api/settings/qr/allocations. Payment accounts are managed on the
// Accounts page, not here.
"use client";

import { useCallback, useEffect, useState } from "react";

type QrMethod = "unique" | "same";

interface QrSettingsData {
  qr_method: QrMethod;
  qr_increment_paise: number;
  active_allocations: number;
  released_today: number;
  expired_today: number;
}

interface AllocationItem {
  id: number;
  order_no: string;
  base_amount: string;
  payable_amount: string;
  status: string;
  expires_at: string;
  allocated_at: string;
  released_at: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; message?: string };
  if (!res.ok || body.success === false) throw new Error(body.message ?? "Request failed");
  return body.data as T;
}

function inr(amount: string): string {
  return `₹${Number(amount).toFixed(2)}`;
}

export function QrSettings() {
  const [settings, setSettings] = useState<QrSettingsData | null>(null);
  const [method, setMethod] = useState<QrMethod>("unique");
  const [increment, setIncrement] = useState(1);
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [allocPage, setAllocPage] = useState(1);
  const [allocTotal, setAllocTotal] = useState(0);
  const [allocStatus, setAllocStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const data = await api<QrSettingsData>("/api/settings/qr");
    setSettings(data);
    setMethod(data.qr_method);
    setIncrement(data.qr_increment_paise);
  }, []);

  const loadAllocations = useCallback(async (page: number, status: string) => {
    const data = await api<{ allocations: AllocationItem[]; page: number; perPage: number; total: number }>(
      `/api/settings/qr/allocations?page=${page}${status ? `&status=${status}` : ""}`,
    );
    setAllocations(data.allocations);
    setAllocPage(data.page);
    setAllocTotal(data.total);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadSettings();
        await loadAllocations(1, "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load QR settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSettings, loadAllocations]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api("/api/settings/qr", {
        method: "POST",
        body: JSON.stringify({ qr_method: method, qr_increment_paise: increment }),
      });
      await loadSettings();
      setMessage("QR settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save QR settings");
    } finally {
      setSaving(false);
    }
  }

  async function changeAllocFilter(status: string) {
    setAllocStatus(status);
    try {
      await loadAllocations(1, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load allocations");
    }
  }

  async function changeAllocPage(page: number) {
    try {
      await loadAllocations(page, allocStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load allocations");
    }
  }

  if (loading) return <p className="text-sm text-[var(--muted)]">Loading QR settings</p>;

  const totalPages = Math.max(1, Math.ceil(allocTotal / 20));

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={save}>
        {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div>
          <label htmlFor="qr-method" className="label">QR method</label>
          <select id="qr-method" className="input w-auto" value={method} onChange={(e) => setMethod(e.target.value as QrMethod)}>
            <option value="same">Normal Amount</option>
            <option value="unique">Unique Amount</option>
          </select>
          <p className="help">
            {method === "unique"
              ? "Each order gets a distinct payable amount a few paise above the order amount, so payments can be matched by amount"
              : "Normal Amount — every QR code shows the order amount. Payments are matched by the order reference or UTR review"}
          </p>
        </div>
        {method === "unique" && (
          <div>
            <label htmlFor="qr-increment" className="label">Increment in paise</label>
            <input
              id="qr-increment" type="number" min={1} max={99} step={1} required
              className="input w-32" value={increment}
              onChange={(e) => setIncrement(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
            <p className="help">Added per order, so the first order pays 1 paise more, the next 2 paise more, and so on</p>
          </div>
        )}
        <p className="help">Changing this affects new orders only. Existing orders keep their allocated amounts</p>
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save QR settings"}</button>
      </form>

      {settings && (
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="text-[var(--muted)]">Active allocations <span className="text-[var(--text)] tabular-nums">{settings.active_allocations}</span></span>
          <span className="text-[var(--muted)]">Released today <span className="text-[var(--text)] tabular-nums">{settings.released_today}</span></span>
          <span className="text-[var(--muted)]">Expired today <span className="text-[var(--text)] tabular-nums">{settings.expired_today}</span></span>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--text)]">Amount allocations</h3>
          <select className="input w-auto" value={allocStatus} onChange={(e) => changeAllocFilter(e.target.value)} aria-label="Filter allocations by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="released">Released</option>
            <option value="consumed">Consumed</option>
          </select>
        </div>
        {allocations.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No allocations yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)]">
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Order amount</th>
                  <th className="py-2 pr-4 font-medium">Payable amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 font-mono text-[13px]">{a.order_no}</td>
                    <td className="py-2 pr-4 tabular-nums">{inr(a.base_amount)}</td>
                    <td className="py-2 pr-4 tabular-nums">{inr(a.payable_amount)}</td>
                    <td className="py-2 pr-4">{a.status}</td>
                    <td className="py-2 text-[var(--muted)]">{new Date(a.expires_at).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center gap-2">
            <button className="btn btn-secondary btn-sm" disabled={allocPage <= 1} onClick={() => changeAllocPage(allocPage - 1)}>Previous</button>
            <span className="text-xs text-[var(--muted)]">Page {allocPage} of {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={allocPage >= totalPages} onClick={() => changeAllocPage(allocPage + 1)}>Next</button>
          </div>
        )}
      </div>

      <p className="text-sm text-[var(--muted)]">
        Payment accounts are managed on the <a className="text-[var(--text)] underline" href="/accounts">Accounts</a> page
      </p>
    </div>
  );
}
