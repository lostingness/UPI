// Dynamic UPI QR — server-side generation with the `qrcode` package.
// Source used BaconQrCode SVG 320px; this port returns a PNG data URL (and the
// API route serves PNG). The QR encodes the merchant's CONFIGURED UPI ID via
// upiIntentUrl — never a hardcoded UPI ID.
import QRCode from "qrcode";
import { upiIntentUrl } from "./orders/intent";
import type { OrderRow } from "./orders/types";

export async function qrDataUrlForOrder(order: OrderRow, account: { provider: string; upi_id: string | null; payee_name: string | null }): Promise<string> {
  return QRCode.toDataURL(upiIntentUrl(order, account), { width: 320, margin: 1, errorCorrectionLevel: "M" });
}
export async function qrPngForOrder(order: OrderRow, account: { provider: string; upi_id: string | null; payee_name: string | null }): Promise<Buffer> {
  return QRCode.toBuffer(upiIntentUrl(order, account), { width: 320, margin: 1, errorCorrectionLevel: "M" });
}
