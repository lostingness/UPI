// Client-side form primitives: field errors from the API envelope
// {message, errors?}, a useApiForm hook, copy-to-clipboard and confirm buttons.
// Ported behaviour from resources/js/app.js (data-copy, data-confirm) and the
// Blade x-input / x-copy components.
"use client";

import { useCallback, useState } from "react";
import { apiFetch, postApi, type ApiResult } from "./api";

export function FieldError({ errors, name }: { errors: Record<string, string[]> | null; name: string }) {
  const msgs = errors?.[name];
  if (!msgs?.length) return null;
  return <p className="mt-1.5 text-xs text-red-400">{msgs.join(" ")}</p>;
}

export function FormMessage({ message, ok }: { message: string | null; ok: boolean }) {
  if (!message) return null;
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ${ok ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-red-500/10 text-red-300 ring-red-500/30"}`}>
      {message}
    </div>
  );
}

export interface ApiFormState<T = unknown> {
  pending: boolean;
  message: string | null;
  ok: boolean;
  errors: Record<string, string[]> | null;
  data: T | null;
  submit: (path: string, body: unknown, method?: string) => Promise<ApiResult<T>>;
  reset: () => void;
}

export function useApiForm<T = unknown>(): ApiFormState<T> {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [data, setData] = useState<T | null>(null);

  const submit = useCallback(async (path: string, body: unknown, method = "POST") => {
    setPending(true); setMessage(null); setOk(false); setErrors(null); setData(null);
    const res = await postApi<T>(path, body, method);
    setPending(false);
    if (res.ok) { setOk(true); setData(res.data); }
    else { setMessage(res.message); setErrors(res.errors); }
    return res;
  }, []);

  const reset = useCallback(() => {
    setPending(false); setMessage(null); setOk(false); setErrors(null); setData(null);
  }, []);

  return { pending, message, ok, errors, data, submit, reset };
}

/** GET through the API envelope (client side). */
export async function getApi<T = unknown>(path: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { method: "GET" });
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm shrink-0"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch {
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand("copy"); document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function ConfirmButton({
  children, confirm, className = "btn btn-danger btn-sm", disabled,
  onDone,
}: {
  children: React.ReactNode; confirm: string; className?: string; disabled?: boolean;
  onDone: () => Promise<ApiResult<unknown>> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button" disabled={disabled || busy} className={className}
        onClick={async () => {
          if (!window.confirm(confirm)) return;
          setBusy(true); setErr(null);
          const r = await onDone();
          setBusy(false);
          if (r && !r.ok) setErr(r.message ?? "Request failed");
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </span>
  );
}
