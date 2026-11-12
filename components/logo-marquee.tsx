// Honest marquee (Round 7) — replaces the 8 fictional wordmarks.
// Two rows, neither labelled Partner / Trusted by / Customer:
//   "Pay via" — the UPI apps a customer pays with (the same brand SVGs
//   the pay page already uses as deep-link buttons).
//   "Built with" — the stack and host this gateway runs on, as text
//   wordmarks (no logo assets exist locally; nothing is fabricated).
// GPay verdict: public/images/upi/gpay.svg is the generic four-colour
// Google "G", NOT a GPay wordmark, so GPay is rendered as a styled text
// wordmark — the "G" is never presented as the GPay logo.
// Seamless loop (duplicated track, translateX -50%), pause on hover,
// animation off under prefers-reduced-motion.
type PayApp = {
  label: string;
  /** UPI brand SVG, or null for GPay (text wordmark only — see above). */
  logo: string | null;
};

const PAY_VIA: PayApp[] = [
  { label: "GPay", logo: null },
  { label: "PhonePe", logo: "/images/upi/phonepe.svg" },
  { label: "Paytm", logo: "/images/upi/paytm.svg" },
  { label: "BHIM", logo: "/images/upi/bhim.svg" },
];

const BUILT_WITH: string[] = ["Next.js", "TypeScript", "Vercel", "Neon", "GitHub"];

const MARQUEE_CSS = `
.hl-marquee{background:#fff;color:var(--ink,#0b1d3a)}
.hl-marquee .marquee-row-label{margin:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5a6b8a}
.hl-marquee .marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.hl-marquee .marquee-track{display:flex;width:max-content;animation:hl-marquee 38s linear infinite}
.hl-marquee .marquee-track.slow{animation-duration:52s}
.hl-marquee .marquee:hover .marquee-track{animation-play-state:paused}
.hl-marquee .marquee-item{display:flex;align-items:center;gap:9px;padding-right:64px;color:#3e4d68;white-space:nowrap}
.hl-marquee .marquee-item img{display:block;width:28px;height:28px;border-radius:7px}
.hl-marquee .app-name{font-size:16px;font-weight:600;letter-spacing:-.01em}
.hl-marquee .stack-name{font-size:16px;font-weight:600;letter-spacing:-.01em}
@keyframes hl-marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.hl-marquee .marquee-track{animation:none}}
`;

function PayViaItem({ app }: { app: PayApp }) {
  return (
    <span className="marquee-item">
      {app.logo ? (
        <img src={app.logo} alt="" width={28} height={28} loading="lazy" />
      ) : null}
      <span className="app-name">{app.label}</span>
    </span>
  );
}

export function LogoMarquee() {
  const payDoubled = [...PAY_VIA, ...PAY_VIA];
  const stackDoubled = [...BUILT_WITH, ...BUILT_WITH];
  return (
    <section className="hl-marquee" aria-label="Payment options and technology">
      <style>{MARQUEE_CSS}</style>
      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <p className="marquee-row-label">Pay via</p>
      </div>
      <div className="marquee pt-5" aria-hidden="true">
        <div className="marquee-track">
          {payDoubled.map((a, i) => (
            <PayViaItem key={`${a.label}-${i}`} app={a} />
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <p className="marquee-row-label">Built with</p>
      </div>
      <div className="marquee pb-14 pt-5" aria-hidden="true">
        <div className="marquee-track slow">
          {stackDoubled.map((name, i) => (
            <span key={`${name}-${i}`} className="marquee-item">
              <span className="stack-name">{name}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
