// Root layout — Axion type: distinctive Google Fonts (Round 5, see
// app/fonts.css) loaded at runtime via <link> — NOT next/font/google
// (it crashed a Vercel build on another project of his). ThemeScript
// runs in <head> pre-paint (no theme flash); BlurOverlay mounts once
// for the click-blur beat.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./fonts.css";
import { ThemeScript } from "@/components/theme-script";
import { BlurOverlay } from "@/components/blur-overlay";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap";

export const metadata: Metadata = {
  title: "UPI Gateway",
  description: "Self-hosted UPI payment gateway for Indian merchants — payments go directly to the merchant's bank account, verified by the provider.",
};

// Next 16: themeColor belongs in the viewport export, not metadata.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFEFEF" },
    { media: "(prefers-color-scheme: dark)", color: "#020816" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#EFEFEF" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#020816" media="(prefers-color-scheme: dark)" />
        {/* Round 5 Google Fonts — preconnect + stylesheet. If the font
            host is unreachable the fonts.css system fallbacks apply and
            the layout is unchanged. CSP allows these hosts in
            middleware.ts (style-src + font-src). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
        <ThemeScript />
      </head>
      <body>
        <BlurOverlay />
        {children}
      </body>
    </html>
  );
}
