// Landing page — "Accept UPI payments directly in your bank account".
// Meridian visual language: deep-navy ink, glass panels, TeX Gyre type,
// CloudFront video hero (layout-engine math keeps the subject's head below
// the CTAs, as in the Meridian hero spec). Brand stays "UPI Gateway".
// Preview is built in code from the project's own pay screen, with demo
// data clearly labelled — demo numbers are never presented as real.
// Testimonials are SAMPLE placeholders only — no real customers quoted.
import Link from "next/link";
import { PublicNav, SiteFooter } from "@/components/layout";
import { FaqItem, Reveal } from "@/components/layout-client";
import { getInstallState, getSessionSafe } from "@/components/server-data";

export const dynamic = "force-dynamic";

const HERO_VIDEO =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0e1b18f2-b590-4b97-96f0-b05e019d07eb.mp4";
const HERO_POSTER =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/19548534-c502-431f-904d-24d31b17c471.jpg";

const FEATURES: [string, string][] = [
  ["Direct to your bank", "Payments go straight to your own UPI ID or PG account. The gateway never holds your funds."],
  ["Provider-verified, never trust the browser", "An order is marked paid only on an exact amount + order-ID + currency + timestamp-bound provider response — never on a UTR alone."],
  ["Manual UPI with UTR review", "Accept payments on a personal UPI ID. Customers submit their 12-digit UTR and you approve it against your bank statement."],
  ["Hosted PG checkout", "PhonePe PG v2 and Paytm PG with a secure hosted checkout, plus Paytm for Business status checks."],
  ["Signed webhooks", "Every paid, expired, under-review and failed transition is delivered as an HMAC-SHA256 timestamped webhook with exactly-once-ish sequencing."],
  ["Sandbox first", "Test keys, TST… orders and a payment simulator with six outcomes — no real money, no provider calls."],
];

const FEATURE_ICONS: React.ReactNode[] = [
  <svg key="bank" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5" /><path d="M4 9.5V18M8.5 9.5V18M15.5 9.5V18M20 9.5V18" /><path d="M2.5 18.5h19M2.5 21h19" /></svg>,
  <svg key="shield" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 5 5.5v5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5v-5L12 3Z" /><path d="m8.8 11.8 2.2 2.2 4.2-4.4" /></svg>,
  <svg key="receipt" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3Z" /><path d="M9 8h6M9 12h6" /></svg>,
  <svg key="pg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M3 10h18M7 15h4" /></svg>,
  <svg key="bolt" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" /></svg>,
  <svg key="flask" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 3h5M10.5 3v5.2L5.8 17a2 2 0 0 0 1.8 3h8.8a2 2 0 0 0 1.8-3l-4.7-8.8V3" /><path d="M8 14.5h8" /></svg>,
];

const STEPS: [string, string][] = [
  ["Create an account", "Sign up as a merchant and log in to your dashboard."],
  ["Add a payment account", "Connect your UPI ID, Paytm for Business, PhonePe PG or Paytm PG."],
  ["Create a payment link", "From the dashboard or with one API call — POST /api/v1/orders."],
  ["Get paid", "Share the link or QR. Your customer pays, you get the money directly."],
];

const FAQS: [string, string][] = [
  ["Does the gateway hold my money?", "No. Payments go directly to your own UPI or PG account. UPI Gateway only verifies and notifies."],
  ["How is a payment confirmed?", "Only a provider status response with the exact amount, order ID, currency and a fresh timestamp marks an order paid. A customer-submitted UTR goes to review until you approve it."],
  ["Can I test without real money?", "Yes — sandbox credentials (test_key_…) create TST… orders you can simulate as success, failure, pending, expiry, timeout or invalid reference."],
  ["Which payment methods are supported?", "Any UPI app (GPay, PhonePe, Paytm, BHIM) via QR or deep link, plus hosted PhonePe and Paytm PG checkout with UPI, card and netbanking."],
  ["What do webhooks look like?", "JSON events (order.paid, order.expired, order.under_review, order.failed, order.pending, order.timeout) signed HMAC-SHA256 as t=…,v1=… with a 5-minute tolerance."],
];

/** Sample testimonials ONLY — no real merchants have been quoted yet.
    Every card carries a visible "Sample" tag and the section states plainly
    that these are placeholders until real merchant feedback exists. */
const TESTIMONIALS: [string, string][] = [
  ["Setup took an afternoon, and the first payment landed in our own account the same day.", "Placeholder merchant — sample quote"],
  ["The UTR review queue finally gives us one place to match every payment.", "Placeholder merchant — sample quote"],
  ["Sandbox mode let us test the whole checkout before going live with real money.", "Placeholder merchant — sample quote"],
  ["One API call creates an order; the webhook tells us the second it is paid.", "Placeholder merchant — sample quote"],
];

const FLOW_STEPS: [string, string][] = [
  ["Create order", "Dashboard or API"],
  ["Show the QR", "Pay screen renders it"],
  ["Customer pays", "Any UPI app"],
  ["Provider verifies", "Exact amount + ID"],
];

/** Deterministic QR-like pattern with finder squares — a visual stand-in for
    the real QR the pay screen renders in code. Demo only, never scannable. */
function DemoQr() {
  const cells: boolean[] = [];
  let seed = 42;
  for (let i = 0; i < 21 * 21; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; cells.push(seed % 100 < 44); }
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7);
  return (
    <div className="animate-qr grid w-44 grid-cols-[repeat(21,minmax(0,1fr))] gap-0 rounded-lg bg-white p-2 sm:w-52" role="img" aria-label="Demo QR code, not a real payment code">
      {cells.map((on, i) => {
        const r = Math.floor(i / 21), c = i % 21;
        const finder = inFinder(r, c);
        const filled = finder
          ? (r % 7 === 0 || r % 7 === 6 || c % 7 === 0 || c % 7 === 6 || (r % 7 >= 2 && r % 7 <= 4 && c % 7 >= 2 && c % 7 <= 4))
          : on;
        return <span key={i} className={`aspect-square ${filled ? "bg-slate-900" : "bg-white"}`} />;
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs font-bold uppercase tracking-wider text-peach">{children}</p>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 max-w-2xl font-display text-3xl font-medium text-slate-50 sm:text-4xl">{children}</h2>;
}

function HeroWord({ word, delay }: { word: string; delay: number }) {
  return (
    <span className="hero-word">
      <span style={{ "--d": `${delay}ms` } as React.CSSProperties}>{word}</span>
    </span>
  );
}

/** Payment-flow diagram — horizontal on sm+, vertical on phones. */
function FlowDiagram() {
  return (
    <div className="mt-10" role="img" aria-label="Payment flow: create order, show the QR, customer pays, provider verifies">
      <svg className="flow-diagram hidden w-full sm:block" viewBox="0 0 720 110" aria-hidden="true">
        {FLOW_STEPS.map(([label, sub], i) => {
          const x = i * 190;
          return (
            <g key={label}>
              <rect className="flow-box" x={x} y={8} width="150" height="94" />
              <text className="flow-num" x={x + 14} y={36} fontSize="13">{`0${i + 1}`}</text>
              <text className="flow-label" x={x + 14} y={62} fontSize="14">{label}</text>
              <text className="flow-sub" x={x + 14} y={84} fontSize="11">{sub}</text>
              {i < 3 && (
                <g>
                  <path className="flow-arrow" d={`M ${x + 158} 55 H ${x + 182}`} />
                  <path className="flow-arrow" d={`M ${x + 176} 50 L ${x + 183} 55 L ${x + 176} 60`} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <svg className="flow-diagram mx-auto w-full max-w-xs sm:hidden" viewBox="0 0 320 380" aria-hidden="true">
        {FLOW_STEPS.map(([label, sub], i) => {
          const y = i * 98;
          return (
            <g key={label}>
              <rect className="flow-box" x={20} y={y} width="280" height="72" />
              <text className="flow-num" x={38} y={y + 30} fontSize="13">{`0${i + 1}`}</text>
              <text className="flow-label" x={38} y={y + 52} fontSize="14">{label} — {sub}</text>
              {i < 3 && (
                <g>
                  <path className="flow-arrow" d={`M 160 ${y + 78} V ${y + 92}`} />
                  <path className="flow-arrow" d={`M 155 ${y + 86} L 160 ${y + 93} L 165 ${y + 86}`} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Hero layout engine (ported from the Meridian hero spec): scales and
 * positions the 1586×992 video so the subject's head stays below the CTAs
 * at 1280×800 and at phone widths. Pure progressive enhancement — without
 * this script the video falls back to plain cover positioning.
 */
const HERO_LAYOUT_SCRIPT = `
(function(){
  "use strict";
  var IW=1586,IH=992,CROWN=530,GAP_D=49.24,GAP_M=26,OVERSCAN=1.00078,MAX_ZOOM=1.4;
  var mqDesk=window.matchMedia('(min-width:1152px) and (min-height:720px)');
  var mqPhone=window.matchMedia('(max-width:510.98px)');
  var root=document.documentElement;
  var hero=document.getElementById('meridian-hero');
  var photo=document.getElementById('meridian-photo');
  var cta=document.getElementById('meridian-cta');
  if(!hero||!photo||!cta)return;
  root.classList.add('m-hero-js');
  var rafId=0;
  function layout(){
    rafId=0;
    var vw=hero.clientWidth,H=hero.clientHeight;
    if(!vw||!H)return;
    var mode=mqDesk.matches?'d':(mqPhone.matches?'m':'t');
    var heroRect=hero.getBoundingClientRect();
    var cb=cta.getBoundingClientRect().bottom-heroRect.top;
    var crown=cb+(mode==='d'?GAP_D:(mode==='t'?GAP_D:GAP_M));
    var cover=Math.max(vw/IW,H/IH);
    var s=Math.max(cover,(H-crown)/(IH-CROWN));
    if(s>cover*MAX_ZOOM){s=cover*MAX_ZOOM;crown=H-(IH-CROWN)*s;}
    s*=OVERSCAN;
    var fx=(vw/H<1)?815:IW/2;
    var x0=Math.min(Math.max(vw/2-fx*s,vw-IW*s),0);
    var y0=crown-CROWN*s;
    photo.style.setProperty('--s',s);
    photo.style.setProperty('--x0',x0+'px');
    photo.style.setProperty('--y0',y0+'px');
  }
  function schedule(){if(rafId)return;rafId=window.requestAnimationFrame(layout);}
  window.addEventListener('load',schedule);
  window.addEventListener('resize',schedule);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule);
  if(mqDesk.addEventListener){mqDesk.addEventListener('change',schedule);mqPhone.addEventListener('change',schedule);}
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(schedule);
  layout();
  var video=photo.querySelector('video');
  function tryPlay(){if(!video)return;video.muted=true;var p=video.play();if(p&&p.catch)p.catch(function(){});}
  tryPlay();
  if(video)video.addEventListener('canplay',tryPlay);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)tryPlay();});
  ['pointerdown','touchstart','scroll'].forEach(function(ev){window.addEventListener(ev,tryPlay,{once:true,passive:true});});
  function posterFallback(){
    photo.style.backgroundImage='url(${HERO_POSTER})';
    photo.style.backgroundSize='cover';
    photo.style.backgroundPosition='50% 100%';
  }
  if(video){
    video.addEventListener('error',posterFallback);
    var probe=new Image();
    probe.onerror=posterFallback;
    probe.src='${HERO_POSTER}';
  }
})();
`;

const HERO_WORDS = ["Accept", "UPI", "payments", "directly", "in", "your", "bank", "account"];

export default async function Home() {
  const [user, state] = await Promise.all([getSessionSafe(), getInstallState()]);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav user={user} />
      <main className="flex-1">
        {/* Meridian hero — full-viewport video, glass pill, display type.
            The sticky PublicNav (64px, owned by the shell) sits above in
            flow, so the hero clears it without a second nav. */}
        <section id="meridian-hero" className="hero-meridian" aria-label="UPI Gateway">
          <div className="hero-photo" id="meridian-photo" aria-hidden="true">
            <video autoPlay muted loop playsInline preload="auto" width={1586} height={992} poster={HERO_POSTER} src={HERO_VIDEO} />
          </div>
          <div className="hero-stage">
            <p className="hero-eyebrow">
              <span className="sq" aria-hidden="true" />
              <span>SELF-HOSTED · MULTI-MERCHANT · UPI</span>
              <svg viewBox="0 0 11 10.5" width="11" height="10.5" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="square" aria-hidden="true"><path d="M1 0.9l4.2 4.35L1 9.6" /><path d="M6.2 0.9l4.2 4.35L6.2 9.6" /></svg>
            </p>
            <h1 className="hero-title">
              {HERO_WORDS.map((w, i) => (
                <span key={w}>
                  <HeroWord word={w} delay={450 + i * 55} />
                  {i < HERO_WORDS.length - 1 ? " " : ""}
                </span>
              ))}
            </h1>
            <p className="hero-lede">
              UPI Gateway is a self-hosted payment gateway for Indian merchants. Create a payment link or call one API —
              your customer pays by UPI QR or deep link, and the money lands straight in your account.
            </p>
            <div className="hero-cta" id="meridian-cta">
              {state.installed ? (
                <Link href="/login" className="btn btn-glass btn-lg"><span>LOG IN TO YOUR DASHBOARD</span></Link>
              ) : (
                <Link href="/setup" className="btn btn-glass btn-lg"><span>SET UP UPI GATEWAY</span></Link>
              )}
              <Link href="/docs" className="btn btn-cta btn-lg">
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.05" aria-hidden="true"><circle cx="2.3" cy="2.3" r="1.75" /><circle cx="9.7" cy="2.3" r="1.75" /><circle cx="2.3" cy="9.7" r="1.75" /><circle cx="9.7" cy="9.7" r="1.75" /><path d="M3.6 3.9L8.4 8.1" /></svg>
                <span>READ THE API DOCS</span>
              </Link>
            </div>
            <ul className="hero-ticks">
              <li>No aggregator fees</li>
              <li>Provider-verified payments</li>
              <li>Sandbox included</li>
              <li>MIT licensed</li>
            </ul>
          </div>
          <script dangerouslySetInnerHTML={{ __html: HERO_LAYOUT_SCRIPT }} />
        </section>

        {/* Pay screen preview + system status (moved out of the hero so the
            Meridian composition stays clean; same real content, same labels) */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label="Pay screen preview and system status">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div>
              <div className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                  <span className="text-sm font-medium text-slate-200">Pay screen</span>
                  <span className="font-mono text-xs text-slate-500">Demo data</span>
                </div>
                <div className="grid sm:grid-cols-2">
                  <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
                    <p className="text-xs text-slate-500">Paying to</p>
                    <p className="mt-1 text-sm font-medium text-slate-100">Demo Store</p>
                    <p className="mt-6 text-xs text-slate-500">Amount</p>
                    <p className="mt-1 font-mono text-3xl font-medium tabular-nums text-slate-50">₹499.00</p>
                    <dl className="mt-6 space-y-2 text-sm">
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Order</dt><dd className="font-mono text-xs text-slate-200">ORD-DEMO-0001</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">UPI ID</dt><dd className="font-mono text-xs text-slate-200">demo@okhdfcbank</dd></div>
                    </dl>
                  </div>
                  <div className="flex flex-col items-center p-5 text-center">
                    <DemoQr />
                    <p className="mt-4 text-sm font-medium text-slate-200">Scan and pay with any UPI app</p>
                    <p className="mt-1 text-xs text-slate-500">GPay · PhonePe · Paytm · BHIM</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />Waiting for payment
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Preview built from the real pay screen. Figures above are demo data, not real payments.</p>
            </div>

            {/* Health / setup status (backend status page, kept) */}
            <div className="rounded-2xl bg-slate-900 px-5 py-4 text-sm ring-1 ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">System status</span>
                <a href="/api/health" className="font-mono text-xs text-brand-400 hover:text-brand-300">/api/health</a>
              </div>
              <dl className="mt-3 space-y-1.5 text-slate-300">
                <div className="flex justify-between"><dt>Database configured</dt><dd className="font-mono">{state.databaseConfigured ? "Yes" : "No"}</dd></div>
                <div className="flex justify-between"><dt>Installed</dt><dd className="font-mono">{state.installed ? "Yes — first admin created" : "Not yet"}</dd></div>
              </dl>
              {!state.databaseConfigured && (
                <p className="mt-3 text-xs leading-relaxed text-amber-300">
                  Database not configured — set the Neon pooled <code className="kbd">DATABASE_URL</code> and run migrations, then finish <Link href="/setup" className="underline">setup</Link>.
                </p>
              )}
              {!state.installed && state.databaseConfigured && (
                <p className="mt-3 text-xs text-slate-400">
                  Database is reachable but no admin exists yet — <Link href="/setup" className="font-medium text-brand-400">create the first admin</Link>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-white/10 bg-slate-900/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>Features</SectionLabel><SectionTitle>Everything a merchant needs, nothing held back</SectionTitle></Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([title, body], i) => (
                <Reveal key={title} delay={i * 40} className="h-full">
                  <div className="card h-full p-5">
                    <span className="inline-flex h-9 w-9 items-center justify-center text-peach ring-1 ring-white/10" aria-hidden="true">{FEATURE_ICONS[i]}</span>
                    <h3 className="mt-4 text-base font-medium text-slate-100">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* QR workflow + Unique vs Same amount */}
        <section id="qr" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal><SectionLabel>QR payments</SectionLabel><SectionTitle>One QR per order, or one QR for every order</SectionTitle></Reveal>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            Every order gets its own QR with the exact amount encoded. For a counter or a printed sign, use one shared QR instead.
          </p>
          <FlowDiagram />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="card p-6">
              <p className="font-mono text-xs text-brand-400">ORD…</p>
              <h3 className="mt-2 text-lg font-medium text-slate-50">Unique amount QR</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Each order gets a QR with its own amount — two customers both order for ₹500.00, the first pays ₹500.01 and the second ₹500.02. The amount is allocated atomically, so two orders never share the same payable amount at the same time, and the provider response is matched to the exact order.
              </p>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Best for</dt><dd className="text-right text-slate-200">Online checkout, payment links</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Amount</dt><dd className="text-right text-slate-200">Fixed per order</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Matching</dt><dd className="text-right text-slate-200">Exact amount + order ID</dd></div>
              </dl>
            </div>
            <div className="card p-6">
              <p className="font-mono text-xs text-brand-400">One QR</p>
              <h3 className="mt-2 text-lg font-medium text-slate-50">Same amount QR</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                One printed QR for a fixed price — a ₹99 item, a ₹299 ticket, a donation of ₹101. Every customer scans the same code and pays the same amount; orders are matched by the customer&apos;s UTR review or by the provider response for that amount.
              </p>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Best for</dt><dd className="text-right text-slate-200">Counters, stalls, printed signs</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Amount</dt><dd className="text-right text-slate-200">Same for every payment</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/5 pt-2"><dt className="text-slate-500">Matching</dt><dd className="text-right text-slate-200">UTR review or provider response</dd></div>
              </dl>
            </div>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Create the order", "Dashboard or API. Amount, currency INR, customer details."],
              ["Show the QR", "The pay screen renders the QR in code with a countdown."],
              ["Verify, then mark paid", "Provider status or approved UTR — never the browser alone."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 font-mono text-sm text-brand-300 ring-1 ring-white/10">{i + 1}</span>
                <div><h3 className="text-sm font-medium text-slate-100">{t}</h3><p className="mt-1 text-sm text-slate-400">{b}</p></div>
              </li>
            ))}
          </ol>
        </section>

        {/* Gateway vs aggregator */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal><SectionLabel>Why self-hosted</SectionLabel><SectionTitle>Gateway, not aggregator</SectionTitle></Reveal>
          <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Aggregators pool your money and settle later. UPI Gateway routes every payment straight to your own account.
          </p>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="th"> </th>
                  <th className="th text-brand-300">UPI Gateway</th>
                  <th className="th">Typical aggregator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ["Where the money goes", "Directly to your bank account", "Aggregator wallet, settled later"],
                  ["Fees", "None from the gateway", "Per-transaction commission"],
                  ["Payment confirmation", "Provider status API + UTR review", "Webhook only"],
                  ["Your data", "On your own database", "On their servers"],
                  ["Sandbox testing", "Built in, six simulated outcomes", "Often paid or limited"],
                ].map(([f, ours, theirs]) => (
                  <tr key={f} className="transition-colors duration-150 hover:bg-slate-800/40">
                    <td className="td font-medium text-slate-300">{f}</td>
                    <td className="td text-slate-100">{ours}</td>
                    <td className="td text-slate-500">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="border-y border-white/10 bg-slate-900/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>Security</SectionLabel><SectionTitle>Verified by the provider, or it is not paid</SectionTitle></Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Exact-match verification", "Amount, order ID, currency and a fresh timestamp must all match the provider response."],
                ["UTR is never enough", "A customer-submitted UTR goes to review. Only your approval — or the provider — marks an order paid."],
                ["Signed webhooks", "HMAC-SHA256, timestamped, sequenced. Tampered or stale deliveries are rejected."],
                ["Secrets stay encrypted", "Provider credentials are stored AES-256-GCM encrypted in your own database."],
                ["Allowlisted redirects", "Customers return only to domains you listed. Anything else is refused."],
                ["Audited admin actions", "Manual overrides and lease recovery are written to the audit log with who and why."],
              ].map(([t, b]) => (
                <div key={t} className="card p-5">
                  <h3 className="text-base font-medium text-slate-100">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Dashboard preview — demo data labelled */}
        <section id="dashboard-preview" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal><SectionLabel>Dashboard</SectionLabel><SectionTitle>Every rupee, in one ledger</SectionTitle></Reveal>
          <div className="mt-10 overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <span className="text-sm font-medium text-slate-200">Dashboard</span>
              <span className="font-mono text-xs text-slate-500">Demo data</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/5 lg:grid-cols-4">
              {[
                ["Today", "₹12,480.00", "6 paid orders today (IST)"],
                ["Total received", "₹1,84,320.00", "312 paid orders"],
                ["Pending / Review", "3 / 1", "Awaiting payment or UTR approval"],
                ["Success rate", "94%", "Paid ÷ closed orders"],
              ].map(([l, v, h]) => (
                <div key={l} className="bg-slate-900 p-5">
                  <p className="text-xs font-medium text-slate-500">{l}</p>
                  <p className="mt-2 font-mono text-xl font-medium tabular-nums text-slate-50">{v}</p>
                  <p className="mt-1.5 text-xs text-slate-500">{h}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 px-5 py-4">
              <p className="text-xs text-slate-500">Recent orders, demo data</p>
              <div className="mt-3 space-y-2 font-mono text-sm tabular-nums">
                <div className="flex justify-between gap-4"><span className="text-brand-400">ORD-DEMO-0004</span><span className="text-slate-200">₹1,250.00</span><span className="text-emerald-300">Paid</span></div>
                <div className="flex justify-between gap-4"><span className="text-brand-400">ORD-DEMO-0003</span><span className="text-slate-200">₹499.00</span><span className="text-emerald-300">Paid</span></div>
                <div className="flex justify-between gap-4"><span className="text-brand-400">ORD-DEMO-0002</span><span className="text-slate-200">₹99.00</span><span className="text-amber-300">Pending</span></div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">The live dashboard shows only real orders from your database — nothing here is a real payment.</p>
        </section>

        {/* Testimonials — SAMPLE placeholders only, never real customers */}
        <section id="testimonials" className="border-y border-white/10 bg-slate-900/40 py-16 sm:py-20" aria-label="Merchant feedback">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>Merchants</SectionLabel><SectionTitle>What merchants say</SectionTitle></Reveal>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Sample quotes only — no real merchants have been quoted yet. These placeholders will be replaced with
              real merchant feedback when it exists.
            </p>
          </div>
          <div className="marquee mt-10" aria-label="Sample merchant quotes">
            <div className="marquee-track">
              {[...TESTIMONIALS, ...TESTIMONIALS].map(([quote, who], i) => (
                <figure
                  key={i}
                  aria-hidden={i >= TESTIMONIALS.length || undefined}
                  className="glass w-[320px] shrink-0 p-5 sm:w-[380px]"
                >
                  <span className="inline-block border border-peach/50 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-peach">Sample</span>
                  <blockquote className="mt-3 text-sm leading-relaxed text-slate-100">“{quote}”</blockquote>
                  <figcaption className="mt-3 text-xs text-slate-500">— {who}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section id="how" className="border-y border-white/10 bg-slate-900/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>Get started</SectionLabel><SectionTitle>Live in four steps</SectionTitle></Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([title, body], i) => (
                <div key={title} className="card p-5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600/15 font-mono text-sm text-brand-300 ring-1 ring-brand-500/30">{i + 1}</span>
                  <h3 className="mt-4 text-base font-medium text-slate-100">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Developer integration */}
        <section id="developer" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal><SectionLabel>Developer</SectionLabel><SectionTitle>One API call creates an order</SectionTitle></Reveal>
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div>
              <p className="max-w-lg text-sm leading-relaxed text-slate-400 sm:text-base">
                Send <code className="kbd">POST /api/v1/orders</code> with your API key and secret. The response carries the payment URL, the UPI intent and the order number — share the link or render the QR from it.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                <li>✓ Idempotent — send an Idempotency-Key and retries are safe</li>
                <li>✓ Rate limited per key and per IP</li>
                <li>✓ Sandbox keys create TST… orders with no provider calls</li>
              </ul>
              <Link href="/docs" className="btn btn-secondary mt-8">Read the full API docs</Link>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-slate-900 p-5 ring-1 ring-white/10">
              <p className="font-mono text-xs text-slate-500">Create an order</p>
              <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed text-slate-300">{`curl -X POST $APP_URL/api/v1/orders \\
  -H "X-Api-Key: $UPI_API_KEY" \\
  -H "X-Api-Secret: $UPI_API_SECRET" \\
  -H "Idempotency-Key: order-1001" \\
  -d '{
    "amount": "499.00",
    "currency": "INR",
    "client_order_id": "order-1001",
    "customer": {
      "name": "Asha Verma",
      "email": "asha@example.com"
    },
    "redirect_url": "https://shop.example.com/thanks"
  }'`}</pre>
              <p className="mt-4 font-mono text-xs text-slate-500">Response — 201, payment_url + upi_intent + order_no</p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal><SectionLabel>Pricing</SectionLabel><SectionTitle>Simple and transparent</SectionTitle></Reveal>
          <div className="card mt-8 max-w-2xl p-6 sm:p-8">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-medium text-slate-50">₹0.00</span>
              <span className="text-sm text-slate-400">self-hosted · MIT licensed</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              UPI Gateway is open source. You host it, you keep your data, and you pay nothing to the gateway.
              The only costs are your own hosting and whatever your bank or PG charges you directly.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-300">
              <li>✓ Unlimited merchants, accounts and orders</li>
              <li>✓ Unlimited API calls and webhooks</li>
              <li>✓ Sandbox with simulated outcomes</li>
              <li>✓ No per-transaction fee, ever</li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-white/10 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal><SectionLabel>FAQ</SectionLabel><SectionTitle>Questions, answered</SectionTitle></Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {FAQS.map(([q, a]) => <FaqItem key={q} q={q} a={a} />)}
            </div>
            <div className="card mt-10 flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-lg font-medium text-slate-50">Start accepting UPI payments today</h3>
                <p className="mt-1 text-sm text-slate-400">Setup takes a few minutes — database, admin account, first payment link.</p>
              </div>
              <Link href={state.installed ? "/login" : "/setup"} className="btn btn-primary btn-lg shrink-0">
                {state.installed ? "Log in" : "Set up now"}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
