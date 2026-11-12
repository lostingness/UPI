// zod schemas for every API input (port of Laravel FormRequest validation).
import { z } from "zod";
import { ApiError } from "./errors";

// Amounts are compared as integer paise downstream (never float equality),
// so every amount entering the system must be exactly representable to
// 2 decimal places — never silently rounded (500.005 is rejected, not
// stored as 500.01 or 500.00).
const twoDp = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

export const amountSchema = z.number().min(1).max(100000)
  .refine(twoDp, "Amount must have at most 2 decimal places");
export const amountStringSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must have at most 2 decimal places")
  .refine((v) => Number(v) >= 1 && Number(v) <= 100000, "Amount must be between 1 and 100000");

export const createOrderApiSchema = z.object({
  amount: z.union([amountSchema, amountStringSchema]).transform((v) => Number(v)),
  client_order_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  payment_account_id: z.number().int().positive().optional().nullable(),
  customer_name: z.string().max(100).optional().nullable(),
  customer_email: z.string().email().max(255).optional().nullable(),
  customer_mobile: z.string().max(20).optional().nullable(),
  note: z.string().max(50).optional().nullable(),
  redirect_url: z.string().url().max(500).refine((u) => u.startsWith("https://"), "redirect_url must be https").optional().nullable(),
  // Per-order QR method (Round 7): "unique" (default platform behaviour —
  // a distinct payable amount a few paise above the order amount) or
  // "normal" (the exact amount, no extra paise). Absent = the merchant's
  // Settings → QR method. "same" is the internal/DB spelling of normal and
  // is NOT accepted here — the API vocabulary is unique|normal only.
  qr_method: z.enum(["unique", "normal"]).optional(),
});

export const createOrderDashboardSchema = z.object({
  amount: z.union([amountSchema, amountStringSchema]).transform((v) => Number(v)),
  payment_account_id: z.number().int().positive().optional().nullable(),
  customer_name: z.string().max(100).optional().nullable(),
  customer_mobile: z.string().max(20).optional().nullable(),
  note: z.string().max(50).optional().nullable(),
  // Per-order QR method — same vocabulary as the API schema above.
  qr_method: z.enum(["unique", "normal"]).optional(),
});

export const utrSchema = z.object({ utr: z.string().regex(/^\s*\d{12}\s*$/, "UTR must be 12 digits") });
export const approveUtrSchema = z.object({
  bank_utr: z.string().regex(/^\s*\d{12}\s*$/, "bank_utr must be 12 digits"),
  received_amount: z.number().min(0.01).max(100000)
    .refine(twoDp, "received_amount must have at most 2 decimal places"),
});
export const rejectUtrSchema = z.object({ reason: z.string().max(150).optional() });
export const manualOverrideSchema = z.object({
  amount: z.number().min(0.01).max(100000)
    .refine(twoDp, "amount must have at most 2 decimal places"),
  verification_reference: z.string().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/),
  reason: z.string().min(20).max(500),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const registerSchema = z.object({
  name: z.string().min(1).max(255), business_name: z.string().max(255).optional().nullable(),
  email: z.string().email(), phone: z.string().max(20).optional().nullable(),
  password: z.string().min(10), password_confirmation: z.string().min(10),
}).refine((d) => d.password === d.password_confirmation, { message: "Passwords do not match", path: ["password_confirmation"] });
export const changePasswordSchema = z.object({
  current_password: z.string().min(1), password: z.string().min(10), password_confirmation: z.string().min(10),
}).refine((d) => d.password === d.password_confirmation, { message: "Passwords do not match", path: ["password_confirmation"] });
export const createAccountSchema = z.object({
  provider: z.enum(["manual", "paytm_business", "paytm_pg", "phonepe_pg"]),
  label: z.string().min(1).max(255),
  upi_id: z.string().regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/).optional().nullable(),
  payee_name: z.string().max(255).optional().nullable(),
  daily_limit: z.number().min(1).max(10000000).optional().nullable(),
  mid: z.string().regex(/^[A-Za-z0-9]+$/).max(40).optional().nullable(),
  merchant_key: z.string().max(100).optional().nullable(),
  website_name: z.string().regex(/^[A-Za-z0-9_]+$/).max(40).optional().nullable(),
  client_id: z.string().max(150).optional().nullable(),
  client_secret: z.string().max(200).optional().nullable(),
  client_version: z.string().max(10).optional().nullable(),
  environment: z.enum(["sandbox", "production"]).optional().nullable(),
});
export const updateLimitSchema = z.object({ daily_limit: z.number().min(1).max(10000000).nullable() });
export const settingsProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(), business_name: z.string().max(255).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});
export const webhookUrlSchema = z.object({ webhook_url: z.string().url().max(500) });
export const rotationSchema = z.object({ rotation_mode: z.enum(["random", "default"]) });
export const redirectDomainsSchema = z.object({ redirect_domains: z.string().max(2000) });
export const setupAdminSchema = z.object({
  name: z.string().min(1).max(255), email: z.string().email(),
  password: z.string().min(10), password_confirmation: z.string().min(10),
}).refine((d) => d.password === d.password_confirmation, { message: "Passwords do not match", path: ["password_confirmation"] });
export const sandboxSimulateSchema = z.object({
  outcome: z.enum(["success", "failed", "pending", "expired", "timeout", "invalid_reference"]),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of r.error.issues) errors[issue.path.join(".") || "body"] = [issue.message];
    throw new ApiError(422, "The given data was invalid.", errors);
  }
  return r.data;
}
