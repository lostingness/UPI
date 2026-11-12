// Halden letter reveal — shared split/paint util + scroll driver (Round 6).
// Split: words wrapped inline-block nowrap, whitespace kept as plain text,
// <br> kept, chars inside .hl flagged (data-hl="1") to finish in accent.
// Paint: t = clamp((p*(1+spread) - i/n)/spread) per char; states per spec:
//   t=0: opacity 0, ghost, blur 8px
//   0->.35: opacity 0->1, ghost, blur 8->1.5px
//   .35->.70: opacity 1, ghost->accent, blur 1.5->0
//   .70->1: opacity 1, accent->final (flagged chars end hlFinal), blur 0.
// Colour + filter:blur() are set inline per char.
// HaldenReveals (client, mounts once, returns null):
//   - adds body.ready (drives .fade-up in the page <style>)
//   - hero #h1: time-based p 0->1 over 1.25s from mount, spread .35
//   - statement #stmt: scroll-based rise + reveal; dispatches a
//     window CustomEvent "halden:stmt" with {p} so Worker B's nav can
//     pop its CTA in when p > .4 (nav files are NOT touched here)
//   - dark split #h2: scroll-based reveal; #row visible once p2 > .92;
//     #ship scale 1.08 -> 1 as the split scrolls in.
// Reduced motion: everything jumps to its final state, no loops.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function clamp(v: number, lo = 0, hi = 1): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Eased smoothstep (x*x*(3-2x)), input clamped to 0..1. */
export function smoothstep(x: number): number {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
}

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(c: Rgb): string {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}

/**
 * Split an element's text into per-char spans, preserving structure:
 * words become inline-block nowrap spans, whitespace stays plain text,
 * <br> is kept, and chars inside a .hl ancestor are flagged data-hl="1".
 * Returns the char spans in document order. Idempotent-ish: only call
 * once per element (it replaces text nodes with spans).
 */
export function splitElement(el: HTMLElement): HTMLSpanElement[] {
  const chars: HTMLSpanElement[] = [];

  const splitTextNode = (node: Text, inHl: boolean): void => {
    const frag = document.createDocumentFragment();
    // Keep whitespace runs as plain text; wrap each word.
    for (const token of node.data.split(/(\s+)/)) {
      if (token === "") continue;
      if (/^\s+$/.test(token)) {
        frag.appendChild(document.createTextNode(token));
        continue;
      }
      const word = document.createElement("span");
      word.className = "hl-word";
      word.style.display = "inline-block";
      word.style.whiteSpace = "nowrap";
      for (const ch of token) {
        const s = document.createElement("span");
        s.className = "hl-char";
        s.style.display = "inline-block";
        if (inHl) s.dataset.hl = "1";
        s.textContent = ch;
        word.appendChild(s);
        chars.push(s);
      }
      frag.appendChild(word);
    }
    node.replaceWith(frag);
  };

  const walk = (node: Node, inHl: boolean): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        splitTextNode(child as Text, inHl);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elem = child as HTMLElement;
        if (elem.tagName === "BR") continue; // <br> kept as-is
        walk(elem, inHl || elem.classList.contains("hl"));
      }
    }
  };

  walk(el, false);
  chars.forEach((c, i) => {
    c.dataset.i = String(i);
  });
  return chars;
}

/**
 * Paint chars for progress p (0..1). final/accent/ghost are hex colours.
 * Flagged (.hl) chars finish at hlFinal (default #5b7cf0); pass the dark
 * accent for dark-on-navy headlines so the flagged word stays readable.
 */
export function paintChars(
  chars: HTMLSpanElement[],
  p: number,
  spread: number,
  final: string,
  accent: string,
  ghost: string,
  hlFinal = "#5b7cf0",
): void {
  const n = chars.length;
  if (n === 0) return;
  const F = hexToRgb(final);
  const A = hexToRgb(accent);
  const G = hexToRgb(ghost);
  const H = hexToRgb(hlFinal);
  for (let i = 0; i < n; i++) {
    const t = clamp((p * (1 + spread) - i / n) / spread);
    const el = chars[i];
    const isHl = el.dataset.hl === "1";
    let opacity: number;
    let blur: number;
    let color: Rgb;
    if (t <= 0) {
      opacity = 0;
      blur = 8;
      color = G;
    } else if (t < 0.35) {
      const k = t / 0.35;
      opacity = k;
      blur = 8 + (1.5 - 8) * k;
      color = G;
    } else if (t < 0.7) {
      const k = (t - 0.35) / 0.35;
      opacity = 1;
      blur = 1.5 * (1 - k);
      color = mixRgb(G, A, k);
    } else {
      const k = (t - 0.7) / 0.3;
      opacity = 1;
      blur = 0;
      color = mixRgb(A, isHl ? H : F, k);
    }
    el.style.opacity = opacity.toFixed(3);
    el.style.color = css(color);
    el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "blur(0px)";
  }
}

export function HaldenReveals() {
  useEffect(() => {
    document.body.classList.add("ready");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const h1 = document.getElementById("h1");
    const stmt = document.getElementById("stmt");
    const h2 = document.getElementById("h2");
    const split = document.getElementById("split");
    const row = document.getElementById("row");
    const ship = document.getElementById("ship");

    const h1Chars = h1 ? splitElement(h1) : [];
    const stmtChars = stmt ? splitElement(stmt) : [];
    const h2Chars = h2 ? splitElement(h2) : [];

    // Hero headline: time-based, 1.25s from mount, spread .35.
    const heroStart = performance.now();
    let heroDone = reduced;
    let lastStmtP = -1;
    let lastH2P = -1;
    let lastStmtEventP = -1;

    const paintScroll = (): void => {
      const vh = window.innerHeight;
      const q = window.scrollY / vh;

      if (stmt && stmtChars.length > 0) {
        // Rise: s = clamp((q-.69)/.74), translateY(.205*(1-s)^2*innerHeight).
        const s = clamp((q - 0.69) / 0.74);
        stmt.style.transform = `translateY(${(0.205 * Math.pow(1 - s, 2) * vh).toFixed(1)}px)`;
        // Reveal: p = clamp((q-.56)/1.13), spread .16. The statement
        // section is 200vh (Round 7, was 306vh): the sticky pin runs
        // q .69 -> 1.69, so p completes exactly at the pin end.
        const p = clamp((q - 0.56) / 1.13);
        if (Math.abs(p - lastStmtP) > 0.0005) {
          lastStmtP = p;
          paintChars(stmtChars, p, 0.16, "#0b1d3a", "#3f7cff", "#ffffff");
        }
        // Nav hook (Worker B owns the nav): emit when p moves materially.
        if (Math.abs(p - lastStmtEventP) >= 0.005) {
          lastStmtEventP = p;
          window.dispatchEvent(new CustomEvent("halden:stmt", { detail: { p } }));
        }
      }

      if (split && h2Chars.length > 0) {
        const top = split.getBoundingClientRect().top;
        const p2 = clamp((0.8 - top / vh) / 0.65);
        if (Math.abs(p2 - lastH2P) > 0.0005) {
          lastH2P = p2;
          // Dark headline: final white, accent #8fe6f4, ghost #5c6f92;
          // flagged chars finish at the accent (readable on navy).
          paintChars(h2Chars, p2, 0.35, "#ffffff", "#8fe6f4", "#5c6f92", "#8fe6f4");
        }
        if (row) row.classList.toggle("is-visible", p2 > 0.92);
        if (ship) {
          const scale = 1.08 - 0.08 * clamp(1 - top / vh);
          ship.style.transform = `scale(${scale.toFixed(4)})`;
        }
      }
    };

    const paintHero = (now: number): void => {
      const p = reduced ? 1 : clamp((now - heroStart) / 1250);
      paintChars(h1Chars, p, 0.35, "#0b1d3a", "#3f7cff", "#ffffff");
      if (p >= 1) heroDone = true;
    };

    let raf = 0;
    if (reduced) {
      paintHero(performance.now());
      paintScroll();
      window.addEventListener("scroll", paintScroll, { passive: true });
      window.addEventListener("resize", paintScroll);
    } else {
      const tick = (now: number): void => {
        if (!heroDone) paintHero(now);
        paintScroll();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", paintScroll);
      window.removeEventListener("resize", paintScroll);
      document.body.classList.remove("ready");
    };
  }, []);

  return null;
}

/**
 * LetterReveal (Round 7) — the char/word variant of the Halden letter
 * system for section headings, intros and marketing text. Reuses
 * splitElement; colours inherit currentColor, so it stays correct in
 * both themes (no hex paint like the hero scenes).
 *
 * Behaviour: text renders normally with no JS. After mount the text is
 * split and the chars/words start hidden (CSS .lr-armed*); an
 * IntersectionObserver adds .lr-done when the element scrolls into view
 * and each char/word transitions in with a small stagger. One observer
 * per element, no rAF loop. Reduced motion: never split — the text is
 * simply there (plus a CSS guard in the page <style>).
 */
export function LetterReveal({
  children,
  variant = "char",
  className = "",
}: {
  children: ReactNode;
  variant?: "char" | "word";
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = splitElement(el);
    const targets =
      variant === "word"
        ? Array.from(el.querySelectorAll<HTMLElement>(".hl-word"))
        : chars;
    // Stagger, capped so a long heading never takes more than ~1s to land.
    const step = variant === "word" ? 55 : 14;
    targets.forEach((t, i) => {
      t.style.transitionDelay = `${Math.min(i * step, 900)}ms`;
    });
    el.classList.add(variant === "word" ? "lr-armed-word" : "lr-armed");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("lr-done");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variant]);

  return (
    <span ref={ref} className={`lr-text${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

/**
 * ShipImage (Round 7) — the dark-split ship photo with a local fallback.
 * The remote higgs.ai image has no fallback; on error this swaps in a
 * gradient panel (same id="ship", so HaldenReveals' scale effect keeps
 * working) instead of a broken image. The panel is a plain CSS gradient
 * — no invented photo, no second remote fetch.
 */
export function ShipImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div id="ship" role="img" aria-label={alt} className="ship-fallback" />;
  }
  return <img id="ship" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
