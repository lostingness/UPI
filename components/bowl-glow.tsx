// Halden bowl glow (Round 6) — a 96x60 <canvas id="bg"> redrawn every
// requestAnimationFrame and CSS-stretched to the full viewport (bilinear
// softening). Fixed .atmo wrapper sits behind everything (z-index 0).
// Client-only: rAF loop + passive scroll reads, no SSR work — the canvas
// starts blank white and paints after mount, so hydration is unaffected.
//
// Shape math (viewport units: y 0..1 top->bottom, x from centre in height
// units, px = |x/W - .5| * aspect):
//   edge curve from 48 points, yy from -0.3 to tip:
//     CX = half*aspect*(1 - yy/tip)^0.72, CY = yy
//   distance = exact distance to the nearest SEGMENT of that polyline
//     (not nearest point), negative when inside
//     (py < tip and px < half*aspect*(1 - py/tip)^0.72)
//   round bottom: subtract RND = 0.25 from the distance
//   fill g = 1 - smoothstep((sd + soft) / (2*soft))  (0 = white, 1 = core)
//   colour: g < .38 mix white -> #d2daff eased smoothstep(g/.38);
//           else mix #d2daff -> #8fd5f1 eased smoothstep((g-.38)/.62)
// Idle drift: tip += sin(t*0.00033 + 1.3)*0.02; half += sin(t*0.0005)*0.015.
// Scroll table (q = scrollY / innerHeight, linear interp between knots):
//   q:    0    .03  .08  .18  .40  .66  .87  1.15 1.43 1.8
//   tip:  .30  .45  .65  .80  .95  1.05 1.05 1.10 1.30 2.40
//   half: .34  .38  .38  .38  .38  .46  .66  .90  1.60 3.00
//   soft: .22  .26  .22  .22  .19  .16  .13  .10  .10  .10
// Inertia: cur += (tgt - cur) * 0.12 per frame.
// Intro: bowl starts tip -.3 / half .3 / soft .1 (pure white page); after
// 0.25s it eases over 1.05s (smoothstep) to the q=0 values; during the
// intro cur is set directly (no inertia).
// Reduced motion: one static frame at the scroll target, repainted on
// scroll only — no loop, no drift.
"use client";

import { useEffect, useRef } from "react";

const Q = [0, 0.03, 0.08, 0.18, 0.4, 0.66, 0.87, 1.15, 1.43, 1.8];
const TIP = [0.3, 0.45, 0.65, 0.8, 0.95, 1.05, 1.05, 1.1, 1.3, 2.4];
const HALF = [0.34, 0.38, 0.38, 0.38, 0.38, 0.46, 0.66, 0.9, 1.6, 3.0];
const SOFT = [0.22, 0.26, 0.22, 0.22, 0.19, 0.16, 0.13, 0.1, 0.1, 0.1];
const RND = 0.25;
const W = 96;
const H = 60;

function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sstep(x: number): number {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interp(table: number[], q: number): number {
  if (q <= Q[0]) return table[0];
  if (q >= Q[Q.length - 1]) return table[table.length - 1];
  for (let i = 0; i < Q.length - 1; i++) {
    if (q >= Q[i] && q <= Q[i + 1]) {
      return lerp(table[i], table[i + 1], (q - Q[i]) / (Q[i + 1] - Q[i]));
    }
  }
  return table[table.length - 1];
}

function draw(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  vw: number,
  vh: number,
  tip: number,
  half: number,
  soft: number,
  t: number,
): void {
  const aspect = vw / vh;
  const driftTip = tip + Math.sin(t * 0.00033 + 1.3) * 0.02;
  const driftHalf = half + Math.sin(t * 0.0005) * 0.015;

  // Edge polyline: 48 points, yy from -0.3 to tip.
  const pts: Array<[number, number]> = [];
  if (driftTip > 0.02) {
    for (let i = 0; i < 48; i++) {
      const yy = -0.3 + (driftTip + 0.3) * (i / 47);
      const base = Math.max(0, 1 - yy / driftTip);
      pts.push([driftHalf * aspect * Math.pow(base, 0.72), yy]);
    }
  }

  const data = img.data;
  for (let j = 0; j < H; j++) {
    const py = (j + 0.5) / H;
    for (let i = 0; i < W; i++) {
      const px = Math.abs((i + 0.5) / W - 0.5) * aspect;
      let sd = Infinity;
      if (pts.length > 1) {
        for (let s = 0; s < pts.length - 1; s++) {
          const [x1, y1] = pts[s];
          const [x2, y2] = pts[s + 1];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len2 = dx * dx + dy * dy;
          let tt = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
          tt = clamp(tt);
          const ex = x1 + tt * dx;
          const ey = y1 + tt * dy;
          const d = Math.hypot(px - ex, py - ey);
          if (d < sd) sd = d;
        }
        const base = Math.max(0, 1 - py / driftTip);
        const inside = py < driftTip && px < driftHalf * aspect * Math.pow(base, 0.72);
        if (inside) sd = -sd;
        sd -= RND;
      }
      const g = 1 - sstep((sd + soft) / (2 * soft));
      let r: number;
      let gc: number;
      let b: number;
      if (g < 0.38) {
        const k = sstep(g / 0.38);
        r = lerp(255, 210, k);
        gc = lerp(255, 218, k);
        b = lerp(255, 255, k);
      } else {
        const k = sstep((g - 0.38) / 0.62);
        r = lerp(210, 143, k);
        gc = lerp(218, 213, k);
        b = lerp(255, 241, k);
      }
      const idx = (j * W + i) * 4;
      data[idx] = r;
      data[idx + 1] = gc;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function BowlGlow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const target = (): { tip: number; half: number; soft: number } => {
      const q = window.scrollY / window.innerHeight;
      return { tip: interp(TIP, q), half: interp(HALF, q), soft: interp(SOFT, q) };
    };

    if (reduced) {
      const t0 = target();
      draw(ctx, img, window.innerWidth, window.innerHeight, t0.tip, t0.half, t0.soft, 0);
      const onScroll = (): void => {
        const t1 = target();
        draw(ctx, img, window.innerWidth, window.innerHeight, t1.tip, t1.half, t1.soft, 0);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }

    const start = performance.now();
    let raf = 0;
    let cur = { tip: -0.3, half: 0.3, soft: 0.1 };

    const frame = (now: number): void => {
      const elapsed = now - start;
      let tip: number;
      let half: number;
      let soft: number;
      if (elapsed < 250) {
        // Intro hold: pure white page.
        tip = -0.3;
        half = 0.3;
        soft = 0.1;
        cur = { tip, half, soft };
      } else if (elapsed < 1300) {
        // Intro ease (smoothstep) to the q=0 values; cur set directly.
        const k = sstep((elapsed - 250) / 1050);
        tip = lerp(-0.3, TIP[0], k);
        half = lerp(0.3, HALF[0], k);
        soft = lerp(0.1, SOFT[0], k);
        cur = { tip, half, soft };
      } else {
        const tgt = target();
        cur.tip += (tgt.tip - cur.tip) * 0.12;
        cur.half += (tgt.half - cur.half) * 0.12;
        cur.soft += (tgt.soft - cur.soft) * 0.12;
        tip = cur.tip;
        half = cur.half;
        soft = cur.soft;
      }
      if (!document.hidden) {
        draw(ctx, img, window.innerWidth, window.innerHeight, tip, half, soft, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="atmo" aria-hidden="true">
      <canvas id="bg" ref={ref} width={96} height={60} />
    </div>
  );
}
