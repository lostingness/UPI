// Checkout client — port of pay.blade.php inline JS + pay/_utr-form.blade.php.
// Polls GET /api/pay/[orderNo]/status every 4 s (pending/review) or 30 s
// (expired/recovering); 1 s countdown tick; UTR submit; hosted PG start.
// A payment is NEVER marked paid here — the page only displays the status
// the server reports, and follows the server-provided redirect when paid.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FieldError, FormMessage, useApiForm } from "./forms";
import { apiFetch, postApi } from "./api";

export interface PayClientProps {
  orderNo: string;
  amount: string;
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

const APPS: { name: string; scheme: string; logo: string; text: string }[] = [
  { name: "GPay", scheme: "tez://upi/pay", logo: "/images/upi/gpay.svg", text: "text-slate-300" },
  { name: "PhonePe", scheme: "phonepe://pay", logo: "/images/upi/phonepe.svg", text: "text-slate-300" },
  { name: "Paytm", scheme: "paytmmp://pay", logo: "/images/upi/paytm.svg", text: "text-slate-300" },
  { name: "BHIM", scheme: "upi://pay", logo: "/images/upi/bhim.svg", text: "text-slate-300" },
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
  return { left, total, display: `${mm}:${ss}`, frac: left / total };
}

function TimerRing({ display, frac, left }: { display: string; frac: number; left: number }) {
  const offset = (100.5 * (1 - frac)).toFixed(2);
  const stroke = left < 60 ? "#f87171" : "#818cf8";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle cx="18" cy="18" r="16" fill="none" stroke="rgb(255 255 255 / .12)" strokeWidth="3" />
        <circle cx="18" cy="18" r="16" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"
          strokeDasharray="100.5" strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-xs font-medium text-slate-100">{display}</div>
    </div>
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
  const { display, frac, left } = useCountdown(props.expiresAt, props.createdAt);
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
    <div className="grid md:grid-cols-5">
      {/* Summary panel */}
      <div className="bg-slate-950 p-6 text-white sm:p-8 md:col-span-2">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-600 text-base font-medium text-white">
            {(props.merchantName[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-xs text-slate-400">Paying to</div>
            <div className="truncate font-medium">{props.merchantName}</div>
          </div>
        </div>
        <div className="mt-8">
          <div className="text-xs text-slate-400">Amount</div>
          <div className="mt-1 font-mono text-4xl font-medium tabular-nums">
            ₹{Number(props.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {props.note && <div className="mt-2 text-sm text-slate-300">{props.note}</div>}
        </div>
        <dl className="mt-8 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="whitespace-nowrap text-slate-400">Order ID</dt><dd className="truncate font-mono text-xs text-slate-200">{props.orderNo}</dd></div>
          {props.customerName && <div className="flex justify-between gap-4"><dt className="whitespace-nowrap text-slate-400">Customer</dt><dd className="truncate text-slate-200">{props.customerName}</dd></div>}
          {props.upiId && <div className="flex justify-between gap-4"><dt className="whitespace-nowrap text-slate-400">UPI ID</dt><dd className="truncate font-mono text-xs text-slate-200">{props.upiId}</dd></div>}
        </dl>
        {status === "pending" && props.expiresAt && (
          <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-8 md:mt-auto">
            <TimerRing display={display} frac={frac} left={left} />
            <div className="text-sm">
              <div className="font-medium">Complete payment in time</div>
              <div className="text-xs text-slate-400">This QR code expires automatically.</div>
            </div>
          </div>
        )}
      </div>

      {/* Action area */}
      <div className="flex flex-col bg-slate-900 p-6 sm:p-8 md:col-span-3">
        {status === "paid" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </div>
            <h1 className="mt-6 text-2xl font-medium text-slate-50">Payment successful</h1>
            <p className="mt-2 text-slate-400">₹{Number(props.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} paid to {props.merchantName}</p>
            <dl className="mt-8 w-full max-w-xs divide-y divide-slate-800 rounded-xl bg-slate-800/60 text-left text-sm ring-1 ring-slate-800">
              {props.utr && <div className="flex justify-between px-4 py-3"><dt className="text-slate-500">UTR</dt><dd className="font-mono font-medium text-slate-100">{props.utr}</dd></div>}
              <div className="flex justify-between px-4 py-3"><dt className="text-slate-500">Paid at</dt><dd className="font-medium text-slate-100">{props.paidAt ? new Date(props.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "—"}</dd></div>
            </dl>
            {props.redirectUrl && <a href={props.redirectUrl} className="btn btn-primary mt-6">Continue to merchant site →</a>}
            <p className="mt-6 text-xs text-slate-500">You can safely close this page.</p>
          </div>
        )}

        {status === "review" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="m9 12 2 2 4-4" /></svg>
            </div>
            <h1 className="mt-6 text-2xl font-medium text-slate-50">Verifying your payment</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-400">{props.merchantName} is confirming your UTR with their bank. This page updates automatically once it&apos;s approved.</p>
            <dl className="mt-8 w-full max-w-xs divide-y divide-slate-800 rounded-xl bg-slate-800/60 text-left text-sm ring-1 ring-slate-800">
              <div className="flex justify-between px-4 py-3"><dt className="text-slate-500">Your UTR</dt><dd className="font-mono font-medium text-slate-100">{props.customerUtr}</dd></div>
              <div className="flex justify-between px-4 py-3"><dt className="text-slate-500">Submitted</dt><dd className="font-medium text-slate-100">{props.utrSubmittedAt ? new Date(props.utrSubmittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST" : "—"}</dd></div>
            </dl>
            <p className="mt-6 text-xs text-slate-500">Don&apos;t pay again. You can close this page; the merchant will be notified once it&apos;s confirmed.</p>
          </div>
        )}

        {status === "expired" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-800 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </div>
            <h1 className="mt-6 text-2xl font-medium text-slate-50">Payment link expired</h1>
            {props.canRecover && props.lateRecoveryUntil && (
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Already paid? Don&apos;t pay again. We can still check the provider until{" "}
                {new Date(props.lateRecoveryUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} IST.
                This page updates when payment is confirmed.
              </p>
            )}
            {props.acceptsUtr ? (
              <>
                <p className="mt-2 max-w-sm text-sm text-slate-400">If you already paid, don&apos;t pay again — submit your UTR below so {props.merchantName} can confirm it.</p>
                <div className="mt-8 w-full max-w-sm"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} /></div>
              </>
            ) : (
              <>
                <p className="mt-2 max-w-xs text-sm text-slate-400">Please ask {props.merchantName} for a new payment link.</p>
                <div className="mt-8 flex max-w-sm items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-300 ring-1 ring-amber-500/30">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  <span>If money was debited from your account, don&apos;t pay again. Share your UTR with the merchant to confirm the payment.</span>
                </div>
              </>
            )}
          </div>
        )}

        {status === "failed" && (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </div>
            <h1 className="mt-6 text-2xl font-medium text-slate-50">Payment failed</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-400">This payment could not be completed. Please ask {props.merchantName} for a new payment link — and don&apos;t pay again on this one.</p>
          </div>
        )}

        {status === "pending" && props.hosted && (
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <div className={`grid h-20 w-20 place-items-center rounded-2xl text-white ${props.pgName === "PhonePe" ? "bg-[#5f259f]" : "bg-[#00baf2]"}`}>
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            </div>
            <h1 className="mt-6 text-xl font-medium text-slate-50">Pay securely with {props.pgName}</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-400">You&apos;ll complete the payment on {props.pgName}&apos;s secure checkout using UPI, card or netbanking, then come back here automatically.</p>
            {startError && <div className="mt-6 flex max-w-sm items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-left text-sm text-red-300 ring-1 ring-red-500/30">{startError}</div>}
            <button className="btn btn-primary btn-lg mt-8 w-full max-w-sm" onClick={startHosted} disabled={starting}>
              {starting ? "Starting secure checkout…" : `Pay ₹${Number(props.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} with ${props.pgName}`}
            </button>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {appLinks.map((a) => (
                <a key={a.name} href={a.href} className={`flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-slate-700 ${a.text}`}>
                  <Image src={a.logo} alt={a.name} width={16} height={16} className="rounded-sm" />{a.name}
                </a>
              ))}
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 ring-1 ring-slate-700">Cards</span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 ring-1 ring-slate-700">Netbanking</span>
            </div>
            <div className="mt-auto pt-6">
              <div className="flex items-center justify-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 text-sm text-slate-300 ring-1 ring-slate-800">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-slate-200" />
                <span>{statusText ?? "Waiting for payment…"}</span>
              </div>
            </div>
          </div>
        )}

        {status === "pending" && !props.hosted && (
          <>
            <div className="text-center">
              <h1 className="text-lg font-semibold text-slate-50">Scan &amp; pay with any UPI app</h1>
              <p className="mt-1 text-sm text-slate-400">Open your UPI app, scan the QR and approve the payment.</p>
            </div>
            {!qrFailed && props.upiIntent ? (
              <div className="animate-qr relative mx-auto mt-6 rounded-2xl bg-white p-3 ring-1 ring-white/10">
                <span className="absolute -left-px -top-px h-6 w-6 rounded-tl-2xl border-l-[3px] border-t-[3px] border-brand-500" />
                <span className="absolute -right-px -top-px h-6 w-6 rounded-tr-2xl border-r-[3px] border-t-[3px] border-brand-500" />
                <span className="absolute -bottom-px -left-px h-6 w-6 rounded-bl-2xl border-b-[3px] border-l-[3px] border-brand-500" />
                <span className="absolute -bottom-px -right-px h-6 w-6 rounded-br-2xl border-b-[3px] border-r-[3px] border-brand-500" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/pay/${props.orderNo}/qr`} alt={`UPI QR code for ₹${props.amount}`} className="h-52 w-52 sm:h-56 sm:w-56" onError={() => setQrFailed(true)} />
              </div>
            ) : (
              <div className="mx-auto mt-6 max-w-sm rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-300 ring-1 ring-amber-500/30">
                QR code is unavailable right now — use the UPI app buttons or pay to the UPI ID below.
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {appLinks.map((a) => (
                <a key={a.name} href={a.href} className={`flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-slate-700 ${a.text}`}>
                  <Image src={a.logo} alt={a.name} width={16} height={16} className="rounded-sm" />{a.name}
                </a>
              ))}
            </div>
            <div className="mt-6 space-y-3 md:hidden">
              <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-800" />Or pay on this phone<span className="h-px flex-1 bg-slate-800" /></div>
              {props.upiIntent && (
                <a href={props.upiIntent} className="btn btn-primary btn-lg w-full">Pay ₹{Number(props.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} with UPI app</a>
              )}
              <div className="grid grid-cols-3 gap-2">
                {appLinks.slice(0, 3).map((a) => (
                  <a key={a.name} href={a.href} className={`btn btn-secondary justify-center font-medium ${a.text}`}>
                    <Image src={a.logo} alt={a.name} width={20} height={20} className="rounded-sm" />{a.name}
                  </a>
                ))}
              </div>
            </div>
            {props.upiId && (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-4 py-3 ring-1 ring-slate-800">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">Or pay to UPI ID</div>
                  <div className="truncate font-mono text-sm font-medium text-slate-100">{props.upiId}</div>
                </div>
                <CopyText text={props.upiId} />
              </div>
            )}
            {props.acceptsUtr && (
              <div className="mt-4"><UtrForm orderNo={props.orderNo} attemptsLeft={attemptsLeft} reviewNote={props.reviewNote} /></div>
            )}
            <div className="mt-auto pt-6">
              <div className="flex items-center justify-center gap-2.5 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-500/40 border-t-amber-300" />
                <span>{statusText ?? (props.acceptsUtr ? "After paying, submit your UTR above" : "Waiting for payment…")}</span>
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">Please don&apos;t close or refresh this page after paying.</p>
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
      className="rounded-xl p-4 text-left ring-1 ring-slate-800"
      onSubmit={async (e) => {
        e.preventDefault();
        await form.submit(`/api/pay/${orderNo}/utr`, { utr });
      }}
    >
      {reviewNote && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
          <div><span className="font-medium text-red-200">Couldn&apos;t verify your last UTR.</span> {reviewNote} Please check the 12-digit UTR in your UPI app and try again.</div>
        </div>
      )}
      {form.ok && (
        <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
          UTR submitted for review. The merchant will confirm it against their bank — this page updates automatically.
        </div>
      )}
      <FormMessage message={form.message} ok={false} />
      <label htmlFor={`utr-${orderNo}`} className="text-sm font-medium text-slate-100">Already paid? Enter your UTR</label>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">Find the 12-digit <span className="font-medium text-slate-300">UTR / UPI Ref. No.</span> in your UPI app&apos;s transaction details.</p>
      <div className="flex gap-2">
        <input id={`utr-${orderNo}`} inputMode="numeric" autoComplete="off" maxLength={14} required
          placeholder="e.g. 412345678901" className="input font-mono"
          value={utr} onChange={(e) => setUtr(e.target.value)} />
        <button className="btn btn-dark shrink-0" disabled={form.pending || form.ok}>
          {form.pending ? "Submitting…" : "Submit"}
        </button>
      </div>
      <FieldError errors={form.errors} name="utr" />
      <p className="mt-2 text-[11px] text-slate-500">
        {attemptsLeft} {attemptsLeft === 1 ? "attempt" : "attempts"} left. The merchant confirms this UTR against their bank account before your order is marked paid.
      </p>
    </form>
  );
}
