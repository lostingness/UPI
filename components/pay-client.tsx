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
import { installGestureUnlock } from "@/lib/sounds";
import { installMp3GestureUnlock, playTimerWarningMp3, playTxnSuccessMp3 } from "@/lib/mp3-sounds";

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
  // Round 7 (H1/H2/M1) payer-binding tokens minted on this render
  // (lib/pay-token.ts). `utr` is sent with the UTR submit (single-use),
  // `start` with a hosted-checkout start (single-use on fresh creation),
  // and either authorises status polls to trigger the throttled provider
  // check. Null when the order cannot accept a payer action. The paid-flip
  // chime and countdown chip are untouched by the token wiring.
  payToken?: { utr: string; start: string } | null;
}

/** M2 (defence-in-depth): the server already masks order.utr in getPayData,
 * so props.utr normally arrives masked; mask again here so a raw value can
 * never render if another path passes one through. */
function maskUtrDisplay(utr: string | null): string | null {
  if (!utr) return null;
  if (utr.includes("•")) return utr; // already masked
  return utr.length <= 4 ? "••••" : "•".repeat(utr.length - 4) + utr.slice(-4);
}

const APPS: { name: string; scheme: string; logo: string; w: number; h: number }[] = [
  // Round 9: official wordmarks — w/h preserve each mark's aspect at a
  // uniform 16px height (GPay 2.67:1, PhonePe 3.30:1, Paytm 3.19:1;
  // BHIM keeps its old 1:1 square). Never render these at 16x16.
  { name: "GPay", scheme: "tez://upi/pay", logo: "/images/upi/gpay.svg", w: 43, h: 16 },
  { name: "PhonePe", scheme: "phonepe://pay", logo: "/images/upi/phonepe.svg", w: 53, h: 16 },
  { name: "Paytm", scheme: "paytmmp://pay", logo: "/images/upi/paytm.svg", w: 51, h: 16 },
  { name: "BHIM", scheme: "upi://pay", logo: "/images/upi/bhim.svg", w: 16, h: 16 },
];

function useCountdown(expiresAt: string | null, createdAt: string, onExpire?: () => void) {
  const total = useMemo(() => {
    if (!expiresAt) return 900;
    return Math.max(1, Math.floor((new Date(expiresAt).getTime() - new Date(createdAt).getTime()) / 1000));
  }, [expiresAt, createdAt]);
  const [left, setLeft] = useState(total);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const lastLeftRef = useRef(total);
  const expireFiredRef = useRef(false);
  useEffect(() => {
    lastLeftRef.current = total;
    expireFiredRef.current = false;
  }, [expiresAt, total]);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const next = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      // Round 7: the 1 s tick and the 4 s status poll drift — the chip
      // would show 00:00 for up to 4 s while the order still reads
      // pending. Fire onExpire exactly once when the countdown first
      // hits 0 so the caller can refresh the status immediately.
      if (next === 0 && lastLeftRef.current > 0 && !expireFiredRef.current) {
        expireFiredRef.current = true;
        onExpireRef.current?.();
      }
      lastLeftRef.current = next;
      setLeft(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  // Round 7 UI: total is exposed for the TimeBar (fill = left/total).
  return { left, total, display: `${mm}:${ss}` };
}

// Round 7 UI — pay-page motion. Tasteful only: icon entrance, check
// draw-in, waiting dots, sheen sweep, QR frame breathing, urgent-chip
// pulse. ALL of it is disabled under prefers-reduced-motion. Nothing
// here touches payment logic — pure presentation.
const PAY_CSS = `
@keyframes pay-pop{from{opacity:0;transform:scale(.72)}to{opacity:1;transform:scale(1)}}
@keyframes pay-draw{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
@keyframes pay-dot{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
@keyframes pay-sheen{from{transform:translateX(-140%)}to{transform:translateX(240%)}}
@keyframes pay-breathe{0%,100%{box-shadow:0 0 0 0 rgba(242,101,34,0)}50%{box-shadow:0 0 0 7px rgba(242,101,34,.09)}}
@keyframes pay-chip{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
.pay-pop{animation:pay-pop .45s cubic-bezier(.22,1,.36,1) both}
.pay-draw{stroke-dasharray:24;stroke-dashoffset:24;animation:pay-draw .5s ease-out .3s forwards}
.pay-dot{animation:pay-dot 1.1s ease-in-out infinite}
.pay-dot:nth-child(2){animation-delay:.15s}
.pay-dot:nth-child(3){animation-delay:.3s}
.pay-sheen{position:absolute;inset:0;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);animation:pay-sheen 2.8s ease-in-out infinite}
.pay-breathe{animation:pay-breathe 3.2s ease-in-out infinite}
.pay-chip-urgent{animation:pay-chip 1s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.pay-pop,.pay-draw,.pay-dot,.pay-sheen,.pay-breathe,.pay-chip-urgent{animation:none!important}.pay-draw{stroke-dashoffset:0}}
`;

// Small inline countdown chip (replaces the old 56px timer ring): sits
// next to the merchant name in the compact header.
function CountdownChip({ display, left }: { display: string; left: number }) {
  const urgent = left < 60;
  return (
    <span
      title={urgent ? "Less than a minute left — this QR expires soon" : "Time left before this QR expires"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-mono text-xs font-semibold ring-1 ${
        urgent
          ? "pay-chip-urgent bg-[var(--accent)]/10 text-[var(--accent-text)] ring-[var(--accent)]/40"
          : "bg-[var(--surface)] text-[var(--muted)] ring-[var(--border)]"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {display}
    </span>
  );
}

// Thin time-remaining bar under the summary header (pending only).
// Fill = left/total; turns accent + pulses under 60 s. Pure display —
// the countdown hook above is the only source of truth.
function TimeBar({ left, total }: { left: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (left / Math.max(1, total)) * 100));
  const urgent = left < 60;
  return (
    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)]" role="progressbar" aria-valuenow={left} aria-valuemin={0} aria-valuemax={total} aria-label="Time left before this QR expires">
      <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? "bg-[var(--accent)]" : "bg-[var(--accent-text)]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm shrink-0 transition-colors ${copied ? "bg-emerald-700 text-white hover:bg-emerald-800" : "btn-secondary"}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>
          Copied
        </>
      ) : "Copy"}
    </button>
  );
}

// The single row of UPI-app deep links (GPay / PhonePe / Paytm / BHIM).
// This is the ONLY deep-link block — the old duplicate md:hidden big CTA
// + 3-button grid was removed in Round 4. Round 7 UI: larger touch
// targets, a subtle brand tint per app, hover lift — hrefs unchanged.
const APP_TINTS: Record<string, string> = {
  GPay: "bg-[#4285f4]/10 ring-[#4285f4]/30",
  PhonePe: "bg-[#5f259f]/10 ring-[#5f259f]/30",
  Paytm: "bg-[#00baf2]/10 ring-[#00baf2]/30",
  BHIM: "bg-[#ed752e]/10 ring-[#ed752e]/30",
};
// Round 9: each logo sits on a small white plate — the official
// wordmarks are dark-on-transparent and unreadable on the dark chip
// tints. Plate is fixed 22px tall; the logo keeps its own aspect.
function AppButtons({ appLinks }: { appLinks: { name: string; href: string; logo: string; w: number; h: number }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {appLinks.map((a) => (
        <a key={a.name} href={a.href} style={{ touchAction: "manipulation" }} className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-[var(--text)] ring-1 transition duration-150 hover:-translate-y-0.5 active:scale-[0.97] ${APP_TINTS[a.name] ?? "bg-[var(--surface-2)] ring-[var(--border)]"}`}>
          <span className="grid h-[22px] shrink-0 place-items-center rounded-[5px] bg-white px-1.5 ring-1 ring-black/5">
            <Image src={a.logo} alt={a.name} width={a.w} height={a.h} />
          </span>{a.name}
        </a>
      ))}
    </div>
  );
}

// Waiting strip — pulsing dots + a slow sheen sweep instead of the old
// spinner. The text prop is unchanged (status-driven).
function WaitingStrip({ text }: { text: string }) {
  return (
    <div className="relative flex items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--muted)] ring-1 ring-[var(--border)]">
      <span className="flex shrink-0 gap-1" aria-hidden="true">
        <span className="pay-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-text)]" />
        <span className="pay-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-text)]" />
        <span className="pay-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-text)]" />
      </span>
      <span className="truncate">{text}</span>
      <span className="pay-sheen" aria-hidden="true" />
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
  // Round 7: bumped when the countdown first hits 0 — the poll effect
  // below re-runs and refreshes the status immediately instead of
  // waiting up to 4 s for the next scheduled poll.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { display, left, total } = useCountdown(props.expiresAt, props.createdAt, () => setRefreshNonce((n) => n + 1));
  const utrForm = useApiForm();
  const [utr, setUtr] = useState("");

  // Poll the server for the (server-verified) status.
  // Round 5: install the gesture unlock so the success chime below can
  // play — browsers block audio until the payer's first tap/keypress on
  // this page, and the chime fires from polling (no gesture at that
  // moment), so the unlock must be armed on mount.
  useEffect(() => { installGestureUnlock(); installMp3GestureUnlock(); }, []);
  // Round 7: timer-warning MP3 — at most once when crossing into the
  // last 60 s and once at expiry (lib/mp3-sounds dedupes per order, so
  // re-renders never replay it). The ~7 s file plays once, never loops.
  useEffect(() => {
    if (status !== "pending" || !props.expiresAt) return;
    if (left <= 60 && left > 0) playTimerWarningMp3(props.orderNo, "warning");
    if (left === 0) playTimerWarningMp3(props.orderNo, "expiry");
  }, [left, status, props.orderNo, props.expiresAt]);
  useEffect(() => {
    if (status === "paid" || status === "failed") return;
    if (status === "expired" && props.lateRecoveryUntil && Date.now() > new Date(props.lateRecoveryUntil).getTime()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Round 7 (H2): the poll presents the pay token (either purpose) so
    // the server may run its throttled provider check. Without a token the
    // server answers with the stored status only — the poll still works.
    const pollToken = props.payToken?.utr ?? props.payToken?.start ?? null;
    const statusUrl = pollToken
      ? `/api/pay/${props.orderNo}/status?pay_token=${encodeURIComponent(pollToken)}`
      : `/api/pay/${props.orderNo}/status`;
    const poll = async () => {
      try {
        const res = await apiFetch<{ status: string; redirect: string | null }>(statusUrl);
        if (!alive || !res.ok || !res.data) { timer = setTimeout(poll, pollDelay); return; }
        if (res.data.status !== statusRef.current) {
          if (res.data.status === "paid") {
            setStatusText("Payment received — redirecting…");
            setStatus("paid");
            // Round 7: MP3 success sound ONLY on the server-confirmed
            // flip to paid (never on load — the initial paid render has
            // no poll flip). Falls back to the synth chime when the file
            // cannot play. Silent no-op before the payer's first gesture
            // or when sounds are off.
            playTxnSuccessMp3();
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
    // Round 7: poll immediately on (re-)mount — the countdown-expiry
    // refresh (refreshNonce) must not wait out the 4 s poll delay.
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [props.orderNo, props.lateRecoveryUntil, pollDelay, status, router, props.payToken, refreshNonce]);

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
    // Round 7 (M1): the start token travels in the POST body; the server
    // consumes it only when creating a fresh checkout.
    const res = await postApi<{ checkout: { type: string; url?: string; fields?: Record<string, string>; expires_at?: number } }>(
      `/api/pay/${props.orderNo}/start`, { pay_token: props.payToken?.start ?? null },
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
      <style>{PAY_CSS}</style>
      {/* Compact summary header — on mobile this is one tight block (payee,
          amount, countdown chip, one meta line); the old dl rows + timer
          ring block are gone. */}
      <div className="animate-rise bg-[var(--surface-2)] px-4 py-3 md:col-span-2 md:px-5 md:py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-strong)] text-sm font-semibold text-[var(--accent-ink)] shadow-[0_2px_10px_-2px_var(--accent-strong)] ring-2 ring-[var(--accent)]/25">
            {(props.merchantName[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Paying to</div>
            <div className="truncate font-display text-sm font-semibold">{props.merchantName}</div>
          </div>
          {status === "pending" && props.expiresAt && <CountdownChip display={display} left={left} />}
        </div>
        <div className="mt-2.5">
          {isUnique ? (
            <>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">Pay exactly</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-[28px] font-bold leading-none tabular-nums">₹{fmt(payAmount)}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--muted)]">Order ₹{fmt(props.amount)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
                Pay this exact amount — it identifies your order.
              </p>
            </>
          ) : (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">Amount</div>
              <div className="mt-0.5 font-display text-[28px] font-bold leading-none tabular-nums">
                ₹{fmt(props.amount)}
              </div>
            </>
          )}
          {props.note && <div className="mt-1 text-xs text-[var(--muted)]">{props.note}</div>}
        </div>
        <p className="mt-2 truncate font-mono text-[11px] text-[var(--faint)]">
          {props.orderNo}{props.upiId ? ` · ${props.upiId}` : ""}{props.customerName ? ` · ${props.customerName}` : ""}
        </p>
        {status === "pending" && props.expiresAt && <TimeBar left={left} total={total} />}
      </div>

      {/* Action area */}
      <div className="animate-rise flex flex-col bg-[var(--surface)] px-4 py-3 md:col-span-3 md:px-5 md:py-5">
        {status === "paid" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="pay-pop grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#34d399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path className="pay-draw" d="m8 12.4 2.7 2.7L16.4 9.4" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Payment successful</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">₹{fmt(payAmount)} paid to {props.merchantName}</p>
            <dl className="mt-4 w-full max-w-xs rounded-xl bg-[var(--surface-2)] text-left text-sm ring-1 ring-[var(--border)]">
              {props.utr && <div className="flex justify-between px-3 py-2"><dt className="text-[var(--faint)]">UTR</dt><dd className="font-mono font-medium">{maskUtrDisplay(props.utr)}</dd></div>}
              <div className={`flex justify-between px-3 py-2${props.utr ? " border-t border-[var(--border)]" : ""}`}><dt className="text-[var(--faint)]">Paid at</dt><dd className="font-medium">{props.paidAt ? new Date(props.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "—"}</dd></div>
            </dl>
            {props.redirectUrl && <a href={props.redirectUrl} className="btn btn-accent mt-4">Continue to merchant site →</a>}
            <p className="mt-4 text-xs text-[var(--faint)]">You can safely close this page.</p>
          </div>
        )}

        {status === "review" && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="pay-pop grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
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
            <div className="pay-pop grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
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
                <div className="mt-3 w-full max-w-sm"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} payToken={props.payToken?.utr ?? null} /></div>
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
            <div className="pay-pop grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.25" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" /></svg>
            </div>
            <h1 className="mt-3 text-xl font-semibold">Payment failed</h1>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">This payment could not be completed. Please ask {props.merchantName} for a new payment link — and don&apos;t pay again on this one.</p>
          </div>
        )}

        {status === "pending" && props.hosted && (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className={`pay-pop grid h-14 w-14 place-items-center rounded-2xl ${props.pgName === "PhonePe" ? "bg-[#5f259f] text-white" : "bg-[#00baf2] text-[#111111]"}`}>
              {/* Round 5: white on Paytm #00baf2 is 2.26:1 (FAIL); #111 is 8.37:1.
                  PhonePe #5f259f keeps white (9.33:1). */}
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
            <h1 className="text-center font-display text-[15px] font-semibold">Scan &amp; pay with any UPI app</h1>
            {!qrFailed && props.upiIntent ? (
              <div className="pay-breathe animate-qr relative mx-auto mt-2.5 rounded-xl bg-white p-2 shadow-[var(--shadow)] ring-1 ring-[var(--border)]">
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
              <div className="mt-2.5"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} payToken={props.payToken?.utr ?? null} /></div>
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

export function UtrForm({ orderNo, attemptsLeft, reviewNote, payToken }: { orderNo: string; attemptsLeft: number; reviewNote: string | null; payToken?: string | null }) {
  const form = useApiForm();
  const [utr, setUtr] = useState("");
  return (
    <form
      className="rounded-2xl bg-[var(--surface-2)] p-3 text-left ring-1 ring-[var(--border)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--accent-text)]/40"
      onSubmit={async (e) => {
        e.preventDefault();
        // Round 7 (H1): the single-use UTR token travels with the submit.
        // A stale token (page re-rendered since) fails 401 with "reload"
        // guidance — the form message surfaces the server's message.
        await form.submit(`/api/pay/${orderNo}/utr`, { utr, pay_token: payToken ?? null });
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
        <input id={`utr-${orderNo}`} inputMode="numeric" autoComplete="off" maxLength={12} required
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
