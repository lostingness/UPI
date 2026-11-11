// Minimal root layout (backend phase). The frontend phase owns app/(pages)/,
// components/, app/globals.css and public/ — this file only provides the
// shell needed for the health/setup status page and for `next build` to pass.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "UPI Gateway", description: "Multi-merchant UPI payment gateway" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
