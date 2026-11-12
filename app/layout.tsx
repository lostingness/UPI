// Root layout — Round 7 UI type (see app/fonts.css): Bricolage
// Grotesque 400/500/600/700 (display) + Inter 400/500/600 (body/UI),
// loaded at runtime via <link> — NOT next/font/google
// (it crashed a Vercel build on another project of his). ThemeScript
// runs in <head> pre-paint (no theme flash); BlurOverlay mounts once
// for the click-blur beat.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./fonts.css";
import { ThemeScript } from "@/components/theme-script";
import { BlurOverlay } from "@/components/blur-overlay";
import { ClickFeedback } from "@/components/click-feedback";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap";

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
        {/* Round 7 UI Google Fonts — preconnect + stylesheet
            (Bricolage Grotesque + Inter; the Round 6 Inter Tight link
            and the Round 5 Fraunces / Space Grotesk / JetBrains Mono
            links are gone). If the font host is unreachable the
            fonts.css system fallbacks apply and the layout is unchanged.
            CSP allows these hosts in middleware.ts (style-src +
            font-src). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
        <ThemeScript />
      </head>
      <body>
        <BlurOverlay />
        <ClickFeedback />
        {children}
      </body>
    </html>
  );
}
