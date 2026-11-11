// HostedCheckout interface — port of HostedCheckout.php.
export interface HostedCheckoutResult { type: "redirect" | "form"; url: string; fields?: Record<string, string>; expires_at: number; }
export interface HostedCheckout {
  startCheckout(order: import("./verification-result").OrderLike, returnUrl: string): Promise<HostedCheckoutResult>;
}
