// Payment + stack rows (Round 8) — replaces the scrolling marquee.
// The marquee read as a moving banner with tiny, uneven items and a
// hard-coded white band (wrong in dark mode). These are static rows:
// a small caps label beside evenly-sized chips, same height, spacing
// and alignment at every width, in both themes. Neither row is labelled
// Partner / Trusted by / Customer:
//   "Pay via" — the UPI apps a customer pays with, each with its real
//   brand SVG from public/images/upi (the same marks the pay page uses
//   as deep-link buttons).
//   "Built with" — the stack and host this gateway runs on, as text
//   wordmarks in identical chips (no logo assets exist locally; nothing
//   is fabricated).
// No animation, no edge fade, no motion to pause.
type PayApp = {
  label: string;
  logo: string;
};

const PAY_VIA: PayApp[] = [
  { label: "GPay", logo: "/images/upi/gpay.svg" },
  { label: "PhonePe", logo: "/images/upi/phonepe.svg" },
  { label: "Paytm", logo: "/images/upi/paytm.svg" },
  { label: "BHIM", logo: "/images/upi/bhim.svg" },
];

const BUILT_WITH: string[] = ["Next.js", "TypeScript", "Vercel", "Neon"];

const BRAND_ROWS_CSS = `
.brand-rows{background:var(--surface);color:var(--text)}
.brand-row{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:center;padding:18px 0}
.brand-row + .brand-row{border-top:1px solid var(--border)}
.brand-row-label{margin:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.brand-chips{display:flex;flex-wrap:wrap;gap:10px}
.brand-chip{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 18px 0 10px;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--border);white-space:nowrap}
.brand-chip img{display:block;width:28px;height:28px;border-radius:7px;flex:none}
.brand-chip-text{padding:0 18px}
.brand-name{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--text)}
@media (max-width:640px){
  .brand-row{grid-template-columns:1fr;gap:10px;padding:16px 0}
  .brand-chip{height:44px;padding:0 14px 0 8px}
  .brand-chip img{width:26px;height:26px}
  .brand-name{font-size:14px}
}
`;

export function LogoMarquee() {
  return (
    <section className="brand-rows" aria-label="Payment options and technology">
      <style>{BRAND_ROWS_CSS}</style>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="brand-row">
          <p className="brand-row-label">Pay via</p>
          <div className="brand-chips">
            {PAY_VIA.map((a) => (
              <span key={a.label} className="brand-chip">
                <img src={a.logo} alt="" width={28} height={28} loading="lazy" />
                <span className="brand-name">{a.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="brand-row">
          <p className="brand-row-label">Built with</p>
          <div className="brand-chips">
            {BUILT_WITH.map((name) => (
              <span key={name} className="brand-chip brand-chip-text">
                <span className="brand-name">{name}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
