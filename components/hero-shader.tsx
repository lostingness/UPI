// Hero shader — Axion-style animated shader hero (shaders@4.0.7).
// 'use client' wrapper: the shader stack is lazy-loaded with a dynamic
// import() inside this client component (next/dynamic ssr:false directly
// in a Server Component page FAILS in Next 16, so it lives here).
//
// Stack (prep-verified real props — the brief's `base/down/left/right/up`
// names are WRONG and silently ignored):
//   ChromaFlow baseColor #ffffff, down/left/right/up #ff5f03,
//     momentum 13, radius 3.5, intensity 1
//   Swirl colorA #ffffff, colorB #f0f0f0, detail 1.7
//   FlutedGlass aberration 0.61, angle 31, frequency 8, highlight 0.12,
//     highlightSoftness 0, lightAngle -90, refraction 4, shape "rounded",
//     softness 1, speed 0.15
//   FilmGrain strength 0.05
//
// WebGPU-only: if WebGPU is unavailable (`navigator.gpu` missing, or the
// Shader `onUnavailable` callback fires) a MANDATORY CSS fallback renders
// instead (soft light-gray gradient + grain, .hero-fallback in
// globals.css) — never a blank hero, never an error to the user.
// Reduced-motion: no shader at all, fallback only. The lazy chunk loads
// after mount and never blocks first paint; the fallback sits underneath
// the canvas while it loads.
//
// NOTE: this VM cannot capture WebGPU canvas pixels in screenshots, so
// shader pixels are NOT claimed verified — only the fallback path and the
// no-crash load path are.
"use client";

import { useEffect, useState } from "react";

type ShaderModule = typeof import("shaders/react");

export function HeroShader() {
  const [stack, setStack] = useState<ShaderModule | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("gpu" in navigator)) return; // no WebGPU → stay on the CSS fallback
    let alive = true;
    import("shaders/react")
      .then((mod) => {
        if (alive) setStack(mod);
      })
      .catch(() => {
        if (alive) setUnavailable(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const showShader = stack !== null && !unavailable;

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="hero-fallback absolute inset-0" />
      {showShader && (
        <stack.Shader
          onUnavailable={() => setUnavailable(true)}
          className="absolute inset-0 h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <stack.ChromaFlow
            baseColor="#ffffff"
            upColor="#ff5f03"
            downColor="#ff5f03"
            leftColor="#ff5f03"
            rightColor="#ff5f03"
            intensity={1}
            radius={3.5}
            momentum={13}
          >
            <stack.Swirl colorA="#ffffff" colorB="#f0f0f0" detail={1.7}>
              <stack.FlutedGlass
                aberration={0.61}
                angle={31}
                frequency={8}
                highlight={0.12}
                highlightSoftness={0}
                lightAngle={-90}
                refraction={4}
                shape="rounded"
                softness={1}
                speed={0.15}
              >
                <stack.FilmGrain strength={0.05} />
              </stack.FlutedGlass>
            </stack.Swirl>
          </stack.ChromaFlow>
        </stack.Shader>
      )}
    </div>
  );
}
