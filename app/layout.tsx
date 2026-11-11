// Root layout — Meridian type: TeX Gyre Adventor ("M Display"), TeX Gyre
// Heros ("M Sans"), TeX Gyre Cursor ("M Mono") via @font-face in
// globals.css (cdnfonts.com — no npm/Google Fonts source exists for them).
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UPI Gateway",
  description: "Self-hosted UPI payment gateway for Indian merchants — payments go directly to the merchant's bank account, verified by the provider.",
  themeColor: "#020816",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#020816" />
        <link rel="preconnect" href="https://fonts.cdnfonts.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://d2ol7oe51mr4n9.cloudfront.net" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
