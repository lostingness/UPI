// Checkout client — port of pay.blade.php inline JS + pay/_utr-form.blade.php.
// Polls GET /api/pay/[orderNo]/status every 4 s (pending/review) or 30 s
// (expired/recovering); 1 s countdown tick; UTR submit; hosted PG start.
// A payment is NEVER marked paid here — the page only displays the status
// the server reports, and follows the server-provided redirect when paid.
//
// Round 4: compact layout — the whole pay screen fits one 390x844 mobile
// viewport without scrolling (QR 192px, countdown as an inline chip next
// to the amount, ONE row of UPI-app buttons, footer hidden below md).
// Payment logic is unchanged: UTR submit goes to `review` only, approve
// flow unchanged, QR intent/amount encoding unchanged.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FieldError, FormMessage, useApiForm } from "./forms";
import { apiFetch, postApi } from "./api";

export interface PayClientProps {
  orderNo: string;
  amount: string;
  // The amount the customer must actually pay. Equals `amount` for Same
  // Amount QR; a few paise above it for Unique Amount QR (the QR/intent
  // encode this value, and provider verification matches against it) — so
  // the page must display THIS, not `amount`, or the customer pays the
  // wrong amount and the payment cannot be matched.
  payableAmount: string;
  qrMethod: string;
  merchantName: string;
  note: string | null;
  customerName: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  upiIntent: string | null;
  upiId: string | null;
  hosted: boolean;
  pgName: string | null;
  acceptsUtr: boolean;
  utrAttempts: number;
  reviewNote: string | null;
  customerUtr: string | null;
  utrSubmittedAt: string | null;
  utr: string | null;
  paidAt: string | null;
  canRecover: boolean;
  lateRecoveryUntil: string | null;
  // Server-allowlisted only: getPayData sets this to the raw redirect_url
  // ONLY when the order is paid AND its host is in the merchant's
  // redirect_domains, else null. The client never sees a raw redirect_url.
  redirectUrl: string | null;
}

const APPS: { name: string; scheme: string; logo: string }[] = [
  { name: "GPay", scheme: "tez://upi/pay", logo: "/images/upi/gpay.svg" },
  { name: "PhonePe", scheme: "phonepe://pay", logo: "/images/upi/phonepe.svg" },
  { name: "Paytm", scheme: "paytmmp://pay", logo: "/images/upi/paytm.svg" },
  { name: "BHIM", scheme: "upi://pay", logo: "/images/upi/bhim.svg" },
];

function useCountdown(expiresAt: string | null, createdAt: string) {
  const total = useMemo(() => {
    if (!expiresAt) return 900;
    return Math.max(1, Math.floor((new Date(expiresAt).getTime() - new Date(createdAt).getTime()) / 1000));
  }, [expiresAt, createdAt]);
  const [left, setLeft] = useState(total);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return { left, display: `${mm}:${ss}` };
}

// Small inline countdown chip (replaces the old 56px timer ring): sits
// next to the merchant name in the compact header.
function CountdownChip({ display, left }: { display: string; left: number }) {
  const urgent = left < 60;
  return (
    <span
      title={urgent ? "Less than a minute left — this QR expires soon" : "Time left before this QR expires"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-mono text-xs font-semibold ring-1 ${
        urgent
          ? "bg-[var(--accent)]/10 text-[var(--accent-text)] ring-[var(--accent)]/40"
          : "bg-[var(--surface)] text-[var(--muted)] ring-[var(--border)]"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {display}
    </span>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button" className="btn btn-secondary btn-sm shrink-0"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

// The single row of UPI-app deep links (GPay / PhonePe / Paytm / BHIM).
// This is the ONLY deep-link block — the old duplicate md:hidden big CTA
// + 3-button grid was removed in Round 4.
function AppButtons({ appLinks }: { appLinks: { name: string; href: string; logo: string }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {appLinks.map((a) => (
        <a key={a.name} href={a.href} style={{ touchAction: "manipulation" }} className="flex min-h-9 items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-[var(--text)] ring-1 ring-[var(--border)] transition hover:brightness-95">
          <Image src={a.logo} alt={a.name} width={14} height={14} className="rounded-sm" />{a.name}
        </a>
      ))}
    </div>
  );
}

function WaitingStrip({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
      <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--faint)] border-t-[var(--accent-text)]" />
      <span className="truncate">{text}</span>
    </div>
  );
}

export default function PayClient(props: PayClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(props.status);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const pollDelay = status === "expired" ? 30000 : 4000;
  const statusRef = useRef(status);
  statusRef.current = status;
  const { display, left } = useCountdown(props.expiresAt, props.createdAt);
  const utrForm = useApiForm();
  const [utr, setUtr] = useState("");

  // Poll the server for the (server-verified) status.
  useEffect(() => {
    if (status === "paid" || status === "failed") return;
    if (status === "expired" && props.lateRecoveryUntil && Date.now() > new Date(props.lateRecoveryUntil).getTime()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await apiFetch<{ status: string; redirect: string | null }>(`/api/pay/${props.orderNo}/status`);
        if (!alive || !res.ok || !res.data) { timer = setTimeout(poll, pollDelay); return; }
        if (res.data.status !== statusRef.current) {
          if (res.data.status === "paid") {
            setStatusText("Payment received — redirecting…");
            setStatus("paid");
            setTimeout(() => {
              if (res.data?.redirect) window.location.href = res.data.redirect;
              else router.refresh(); // re-render from the server props (paid panel, UTR, paid_at) without a full reload
            }, 1500);
            return;
          }
          setStatus(res.data.status);
          // Re-render from the server props (e.g. pending → review needs
          // the submitted UTR + attempts the server now reports) instead
          // of a full page reload.
          router.refresh();
          return;
        }
      } catch { /* transient — keep polling */ }
      timer = setTimeout(poll, pollDelay);
    };
    timer = setTimeout(poll, pollDelay);
    return () => { alive = false; clearTimeout(timer); };
  }, [props.orderNo, props.lateRecoveryUntil, pollDelay, status, router]);

  const query = props.upiIntent ? props.upiIntent.split("?")[1] ?? "" : "";
  const appLinks = APPS.map((a) => ({ ...a, href: `${a.scheme}?${query}` }));
  const attemptsLeft = Math.max(0, 3 - props.utrAttempts);
  // Unique Amount QR: the payable amount differs from the order amount by a
  // few paise — display the payable amount as the amount to pay, with the
  // order amount shown for reference. Same Amount QR: both are equal.
  const isUnique = props.qrMethod === "unique" && Number(props.payableAmount) !== Number(props.amount);
  const payAmount = props.payableAmount;
  const fmt = (v: string) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const startHosted = async () => {
    setStarting(true); setStartError(null);
    const res = await postApi<{ checkout: { type: string; url?: string; fields?: Record<string, string>; expires_at?: number } }>(
      `/api/pay/${props.orderNo}/start`, {},
    );
    setStarting(false);
    if (!res.ok || !res.data?.checkout) { setStartError(res.message ?? "Could not start checkout"); return; }
    const c = res.data.checkout;
    if (c.type === "redirect" && c.url) window.location.href = c.url;
    else if (c.type === "form") router.push(`/pay/${props.orderNo}/redirect`);
    else setStartError("Unexpected checkout response from provider");
  };

  return (
    <div className="grid bg-[var(--surface)] text-[var(--text)] md:grid-cols-5">
      {/* Compact summary header — on mobile this is one tight block (payee,
          amount, countdown chip, one meta line); the old dl rows + timer
          ring block are gone. */}
      <div className="animate-rise bg-[var(--surface-2)] px-4 py-3 md:col-span-2 md:px-5 md:py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-strong)] text-sm font-semibold text-[var(--accent-ink)]">
            {(props.merchantName[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Paying to</div>
            <div className="truncate text-sm font-semibold">{props.merchantName}</div>
          </div>
          {status === "pending" && props.expiresAt && <CountdownChip display={display} left={left} />}
        </div>
        <div className="mt-2.5">
          {isUnique ? (
            <>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">Pay exactly</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-2xl font-semibold leading-none tabular-nums">₹{fmt(payAmount)}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--muted)]">Order ₹{fmt(props.amount)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
                Pay this exact amount — it identifies your order.
              </p>
            </>
          ) : (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Amount</div>
              <div className="mt-0.5 font-mono text-2xl font-semibold leading-none tabular-nums">
                ₹{fmt(props.amount)}
              </div>
            </>
          )}
          {props.note && <div className="mt-1 text-xs text-[var(--muted)]">{props.note}</div>}
        </div>
        <p className="mt-2 truncate font-mono text-[11px] text-[var(--faint)]">
          {props.orderNo}{props.upiId ? ` · ${props.upiId}` : ""}{props.customerName ? ` · ${props.customerName}` : ""}
        </p>
      </div>

      {/* Action area */}
      <div className="animate-rise flex flex-col bg-[var(--surface)] px-4 py-3 md:col-span-3 md:px-5 md:py-5">
        {status === "paid" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#34d399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="m8 12.4 2.7 2.7L16.4 9.4" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Payment successful</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">₹{fmt(payAmount)} paid to {props.merchantName}</p>
            <dl className="mt-4 w-full max-w-xs rounded-xl bg-[var(--surface-2)] text-left text-sm ring-1 ring-[var(--border)]">
              {props.utr && <div className="flex justify-between px-3 py-2"><dt className="text-[var(--faint)]">UTR</dt><dd className="font-mono font-medium">{props.utr}</dd></div>}
              <div className={`flex justify-between px-3 py-2${props.utr ? " border-t border-[var(--border)]" : ""}`}><dt className="text-[var(--faint)]">Paid at</dt><dd className="font-medium">{props.paidAt ? new Date(props.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "—"}</dd></div>
            </dl>
            {props.redirectUrl && <a href={props.redirectUrl} className="btn btn-accent mt-4">Continue to merchant site →</a>}
            <p className="mt-4 text-xs text-[var(--faint)]">You can safely close this page.</p>
          </div>
        )}

        {status === "review" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#38bdf8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="M12 7v5.2l3.2 2" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Verifying your payment</h1>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{props.merchantName} is confirming your UTR with their bank. This page updates automatically once it&apos;s approved.</p>
            <dl className="mt-4 w-full max-w-xs rounded-xl bg-[var(--surface-2)] text-left text-sm ring-1 ring-[var(--border)]">
              <div className="flex justify-between px-3 py-2"><dt className="text-[var(--faint)]">Your UTR</dt><dd className="font-mono font-medium">{props.customerUtr}</dd></div>
              <div className="flex justify-between border-t border-[var(--border)] px-3 py-2"><dt className="text-[var(--faint)]">Submitted</dt><dd className="font-medium">{props.utrSubmittedAt ? new Date(props.utrSubmittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "—"}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-[var(--faint)]">Don&apos;t pay again. You can close this page; the merchant will be notified once it&apos;s confirmed.</p>
          </div>
        )}

        {status === "expired" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#fbbf24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Payment link expired</h1>
            {props.canRecover && props.lateRecoveryUntil && (
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Already paid? Don&apos;t pay again. We can still check the provider until{" "}
                {new Date(props.lateRecoveryUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} IST.
                This page updates when payment is confirmed.
              </p>
            )}
            {props.acceptsUtr ? (
              <>
                <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">If you already paid, don&apos;t pay again — submit your UTR below so {props.merchantName} can confirm it.</p>
                <div className="mt-3 w-full max-w-sm"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} /></div>
              </>
            ) : (
              <>
                <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">Please ask {props.merchantName} for a new payment link.</p>
                <div className="mt-3 flex max-w-sm items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-left text-[13px] text-[var(--text)] ring-1 ring-amber-500/30">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  <span>If money was debited from your account, don&apos;t pay again. Share your UTR with the merchant to confirm the payment.</span>
                </div>
              </>
            )}
          </div>
        )}

        {status === "failed" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Payment failed</h1>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">This payment could not be completed. Please ask {props.merchantName} for a new payment link — and don&apos;t pay again on this one.</p>
          </div>
        )}

        {status === "pending" && props.hosted && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className={`grid h-14 w-14 place-items-center rounded-2xl text-white ${props.pgName === "PhonePe" ? "bg-[#5f259f]" : "bg-[#00baf2]"}`}>
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            </div>
            <h1 className="mt-3 text-lg font-semibold">Pay securely with {props.pgName}</h1>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--muted)]">You&apos;ll complete the payment on {props.pgName}&apos;s secure checkout using UPI, card or netbanking, then come back here automatically.</p>
            {startError && <div className="mt-3 flex max-w-sm items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-left text-[13px] text-[var(--text)] ring-1 ring-red-500/30">{startError}</div>}
            <button className="btn btn-accent btn-lg mt-4 w-full max-w-sm font-semibold" style={{ touchAction: "manipulation" }} onClick={startHosted} disabled={starting}>
              {starting ? "Starting secure checkout…" : `Pay ₹${fmt(payAmount)} with ${props.pgName}`}
            </button>
            {props.upiIntent && (
              <div className="mt-2.5">
                <AppButtons appLinks={appLinks} />
              </div>
            )}
            {!props.upiIntent && props.upiId && (
              <div className="mt-2.5 flex w-full max-w-sm items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--border)]">
                <span className="min-w-0 truncate font-mono text-[13px] font-medium">
                  <span className="text-[var(--faint)]">UPI ID · </span>{props.upiId}
                </span>
                <CopyText text={props.upiId} />
              </div>
            )}
            <div className="mt-2.5 w-full max-w-sm">
              <WaitingStrip text={statusText ?? "Waiting for payment…"} />
            </div>
          </div>
        )}

        {status === "pending" && !props.hosted && (
          <>
            <h1 className="hidden text-center text-[15px] font-semibold md:block">Scan &amp; pay with any UPI app</h1>
            {!qrFailed && props.upiIntent ? (
              <div className="animate-qr relative mx-auto mt-2.5 rounded-xl bg-white p-2 shadow-[var(--shadow)] ring-1 ring-[var(--border)]">
                <span className="absolute -left-px -top-px h-4 w-4 rounded-tl-xl border-l-[3px] border-t-[3px] border-[var(--accent)]" />
                <span className="absolute -right-px -top-px h-4 w-4 rounded-tr-xl border-r-[3px] border-t-[3px] border-[var(--accent)]" />
                <span className="absolute -bottom-px -left-px h-4 w-4 rounded-bl-xl border-b-[3px] border-l-[3px] border-[var(--accent)]" />
                <span className="absolute -bottom-px -right-px h-4 w-4 rounded-br-xl border-b-[3px] border-r-[3px] border-[var(--accent)]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/pay/${props.orderNo}/qr`} alt={`UPI QR code for ₹${payAmount}`} className="h-48 w-48" onError={() => setQrFailed(true)} />
              </div>
            ) : (
              <div className="mx-auto mt-2.5 max-w-sm rounded-lg bg-amber-500/10 px-3 py-2 text-center text-[13px] text-[var(--text)] ring-1 ring-amber-500/30">
                QR code is unavailable right now — use the UPI app buttons or pay to the UPI ID below.
              </div>
            )}
            {props.upiIntent && (
              <div className="mt-2.5">
                <AppButtons appLinks={appLinks} />
              </div>
            )}
            {props.upiId && (
              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--border)]">
                <span className="min-w-0 truncate font-mono text-[13px] font-medium">
                  <span className="text-[var(--faint)]">UPI ID · </span>{props.upiId}
                </span>
                <CopyText text={props.upiId} />
              </div>
            )}
            {props.acceptsUtr && (
              <div className="mt-2.5"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} /></div>
            )}
            <div className="mt-2.5">
              <WaitingStrip text={statusText ?? (props.acceptsUtr ? "After paying, submit your UTR above" : "Waiting for payment…")} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function UtrForm({ orderNo, attemptsLeft, reviewNote }: { orderNo: string; attemptsLeft: number; reviewNote: string | null }) {
  const form = useApiForm();
  const [utr, setUtr] = useState("");
  return (
    <form
      className="rounded-xl bg-[var(--surface-2)] p-3 text-left ring-1 ring-[var(--border)]"
      onSubmit={async (e) => {
        e.preventDefault();
        await form.submit(`/api/pay/${orderNo}/utr`, { utr });
      }}
    >
      {reviewNote && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-[var(--text)] ring-1 ring-red-500/30">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <div><span className="font-medium">Couldn&apos;t verify your last UTR.</span> {reviewNote} Please check the 12-digit UTR in your UPI app and try again.</div>
        </div>
      )}
      {form.ok && (
        <div className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-[var(--text)] ring-1 ring-emerald-500/30">
          UTR submitted for review. The merchant will confirm it against their bank — this page updates automatically.
        </div>
      )}
      <FormMessage message={form.message} ok={false} />
      <label htmlFor={`utr-${orderNo}`} className="text-[13px] font-medium">Already paid? Enter your UTR</label>
      <div className="mt-1.5 flex gap-2">
        <input id={`utr-${orderNo}`} inputMode="numeric" autoComplete="off" maxLength={14} required
          placeholder="e.g. 412345678901" className="input font-mono"
          value={utr} onChange={(e) => setUtr(e.target.value)} />
        <button className="btn btn-dark shrink-0" disabled={form.pending || form.ok}>
          {form.pending ? "Submitting…" : "Submit"}
        </button>
      </div>
      <FieldError errors={form.errors} name="utr" />
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--faint)]">
        {attemptsLeft} {attemptsLeft === 1 ? "attempt" : "attempts"} left · UTR is in your UPI app.
      </p>
    </form>
  );
}
