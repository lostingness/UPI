// Root layout — Axion type: system font stack (see globals.css).
// The TeX Gyre @font-face blocks and the cdnfonts/CloudFront preconnects
// are gone with the Round 3 Meridian hero. ThemeScript runs in <head>
// pre-paint (no theme flash); BlurOverlay mounts once for the
// click-blur beat.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { BlurOverlay } from "@/components/blur-overlay";

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
        <ThemeScript />
      </head>
      <body>
        <BlurOverlay />
        {children}
      </body>
    </html>
  );
}
