// POST /api/demo/orders — create a demo payment link (Round 8).
//
// Session-authenticated merchant only. Creates ONE sandbox order via the
// shared createOrder() (lib/orders/create.ts) — the same function the
// API-key sandbox path uses — with a fixed demo amount and demo-labelled
// customer/note. No live order is ever created here, no payment account is
// resolved, no provider is contacted, and nothing in this handler can mark
// an order paid. The response carries the shareable demo URL
// (/demo/pay/TST…), whose path itself says DEMO.
//
// Rate limits: per-IP memory bucket + per-merchant two-layer bucket
// (memory first, durable DB bucket second — the durable check falls back
// to memory when the DB is not configured, same as the order-create path).
import { ApiError } from "./errors";
import { gatewayConfig } from "./config/gateway";
import { getSession, type SessionUser } from "./auth";
import { createOrder, type CreateOrderInput } from "./orders/create";
import type { OrderRow } from "./orders/types";
import {
  DEMO_AMOUNT, DEMO_CUSTOMER_NAME, DEMO_NOTE, demoPaymentUrl, type DemoOrderResult,
} from "./demo";
import {
  checkMemoryRateLimit, checkTwoLayerRateLimit, getClientIp, rateLimitHeaders,
  type RateLimitResult,
} from "./rate-limit";
import { handleError, json, ok } from "./http";

/** Test seam: handlers accept injected deps so tests can run with no DB. */
export interface DemoOrderDeps {
  /** undefined = resolve the real session; null = explicitly unauthenticated. */
  sessionUser?: SessionUser | null;
  createOrderFn?: (input: CreateOrderInput) => Promise<OrderRow>;
  rateLimitCheck?: (key: string, limit: number) => RateLimitResult;
}

function depsOr<T>(v: T | undefined, fallback: () => T): T { return v === undefined ? fallback() : v; }

/** Demo links are cheap but not free: 30/min per merchant, 60/min per IP. */
export const DEMO_CREATE_LIMIT = 30;
export const DEMO_CREATE_IP_LIMIT = 60;

export async function handleCreateDemoOrder(req: Request, deps: DemoOrderDeps = {}) {
  try {
    const user = deps.sessionUser !== undefined ? deps.sessionUser : await getSession();
    if (!user) throw new ApiError(401, "Unauthenticated");
    if (!user.isActive) throw new ApiError(403, "Your account has been disabled");
    const rateLimitCheck = depsOr(deps.rateLimitCheck, () => checkMemoryRateLimit);
    const ip = getClientIp(req);
    const ipCheck = rateLimitCheck(`demo:create:ip:${ip}`, DEMO_CREATE_IP_LIMIT);
    if (!ipCheck.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(ipCheck));
    // Injected check (tests) covers both buckets; the real path uses the
    // two-layer merchant bucket (memory + durable DB, memory fallback).
    const keyCheck = deps.rateLimitCheck
      ? deps.rateLimitCheck(`demo:create:${user.id}`, DEMO_CREATE_LIMIT)
      : await checkTwoLayerRateLimit(`demo:create:${user.id}`, DEMO_CREATE_LIMIT);
    if (!keyCheck.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(keyCheck));
    const createOrderFn = depsOr(deps.createOrderFn, () => createOrder);
    // Sandbox only, fixed demo amount, demo-labelled customer/note — the
    // shared createOrder() handles the TST… number, expiry and insert.
    // No paymentAccountId: sandbox orders never have a payment account.
    const order = await createOrderFn({
      userId: user.id, environment: "sandbox", amount: DEMO_AMOUNT,
      customerName: DEMO_CUSTOMER_NAME, note: DEMO_NOTE,
    });
    const data: DemoOrderResult = {
      demo: true,
      order_id: order.order_no,
      payment_url: demoPaymentUrl(order.order_no),
      amount: Number(order.amount).toFixed(2),
      currency: "INR",
      status: order.status,
      environment: "sandbox",
      // createOrder always sets expires_at; the fallback is only for the
      // nullable type (never null in practice).
      expires_at: order.expires_at ?? new Date(Date.now() + gatewayConfig.orderExpiryMinutes * 60 * 1000).toISOString(),
    };
    return ok(data, 201);
  } catch (e) { return handleError(e); }
}
