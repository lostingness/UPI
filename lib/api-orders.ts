// Shared handler for POST /api/v1/orders and POST /api/orders (alias).
//
// Two auth modes, ONE order-creation path:
//  - API-key mode: X-Api-Key / X-Api-Secret headers present (existing
//    behaviour, incl. client_order_id + redirect_url + sandbox env).
//  - Session mode (GAP 1): no API-key header — the logged-in merchant's
//    session cookie (upi-gateway-session) authenticates instead. The order
//    is always created for the session merchant themselves (live env, the
//    merchant's default payment account via rotation), never for another
//    merchant. The merchant's API secret is never exposed to the frontend.
// Both modes use the same createOrder() (lib/orders/create.ts), the same
// idempotency-key handling (scoped per merchant), and the same rate limits
// (per-merchant order-create bucket + per-IP bucket).
import { authenticateApiKey, isRedirectUrlAllowed } from "./api-auth";
import { createOrderApiSchema, createOrderDashboardSchema, parseBody } from "./validate";
import { createOrder, type CreateOrderInput } from "./orders/create";
import { toApiArray } from "./orders/serialize";
import { gatewayConfig } from "./config/gateway";
import { getSql, first, type Row } from "./db";
import { ApiError } from "./errors";
import { checkIdempotency, storeIdempotentResponse, defaultIdempotencyStore, type IdempotencyStore } from "./idempotency";
import { checkMemoryRateLimit, getClientIp, rateLimitHeaders, orderCreateLimit, apiIpLimit, type RateLimitResult } from "./rate-limit";
import { json, handleError, readJson } from "./http";
import { getSession, type SessionUser } from "./auth";
import { assertAccountOwnedBy } from "./merchant-orders";
import type { OrderRow } from "./orders/types";

/** Test seam: handlers accept injected deps so tests can run with no DB. */
export interface CreateOrderDeps {
  /** undefined = resolve the real session; null = explicitly unauthenticated. */
  sessionUser?: SessionUser | null;
  createOrderFn?: (input: CreateOrderInput) => Promise<OrderRow>;
  idempotencyStore?: IdempotencyStore;
  rateLimitCheck?: (key: string, limit: number) => RateLimitResult;
  accountOwnerCheck?: (userId: number, accountId: number) => Promise<void>;
}

function depsOr<T>(v: T | undefined, fallback: () => T): T { return v === undefined ? fallback() : v; }

async function serializeCreatedOrder(order: OrderRow) {
  const account = order.payment_account_id
    ? first<Row>(await getSql()`SELECT provider, upi_id, payee_name FROM payment_accounts WHERE id = ${order.payment_account_id}`)
    : null;
  return { success: true, data: toApiArray(order, account as never, gatewayConfig.appUrl) };
}

async function finishCreate(
  input: CreateOrderInput, idemKey: string | null, body: unknown, store: IdempotencyStore,
  createOrderFn: (input: CreateOrderInput) => Promise<OrderRow>,
) {
  const order = await createOrderFn(input);
  const payload = await serializeCreatedOrder(order);
  if (idemKey) await storeIdempotentResponse(store, `${input.userId}:${idemKey}`, body, 201, payload);
  return json(payload, 201);
}

export async function handleCreateOrder(req: Request) {
  try {
    const merchant = await authenticateApiKey(req);
    // Rate limits: per-key order-create bucket 1000/min + shared per-IP 600/min.
    const keyCheck = checkMemoryRateLimit(`api:order-create:${merchant.id}`, orderCreateLimit());
    if (!keyCheck.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(keyCheck));
    const body = await readJson(req);
    const data = parseBody(createOrderApiSchema, body);
    if (data.redirect_url && !isRedirectUrlAllowed(data.redirect_url, merchant.redirectDomains)) {
      throw new ApiError(422, "Redirect URLs are not enabled for this merchant. Add the domain in Settings first.");
    }
    const idemKey = req.headers.get("Idempotency-Key") ?? req.headers.get("X-Idempotency-Key") ?? null;
    const store = defaultIdempotencyStore();
    if (idemKey) {
      const replay = await checkIdempotency(store, `${merchant.id}:${idemKey}`, body);
      if (replay) return json(replay.body, replay.status);
    }
    return await finishCreate({
      userId: merchant.id, environment: merchant.environment, amount: data.amount,
      clientOrderId: data.client_order_id, paymentAccountId: data.payment_account_id ?? null,
      customerName: data.customer_name ?? null, customerEmail: data.customer_email ?? null,
      customerMobile: data.customer_mobile ?? null, note: data.note ?? null,
      redirectUrl: data.redirect_url ?? null,
    }, idemKey, body, store, createOrder);
  } catch (e) { return handleError(e); }
}

/**
 * GAP 1 — session-authenticated order creation (dashboard form).
 * Live environment only (the Laravel dashboard store creates live orders);
 * the merchant's default payment account is picked by rotation when no
 * account id is given, exactly as createOrder() does for the API path.
 */
export async function handleCreateOrderSession(req: Request, deps: CreateOrderDeps = {}) {
  try {
    const user = deps.sessionUser !== undefined ? deps.sessionUser : await getSession();
    if (!user) throw new ApiError(401, "Unauthenticated");
    if (!user.isActive) throw new ApiError(403, "Your account has been disabled");
    const rateLimitCheck = depsOr(deps.rateLimitCheck, () => checkMemoryRateLimit);
    const ip = getClientIp(req);
    const ipCheck = rateLimitCheck(`session:order-create:ip:${ip}`, apiIpLimit());
    if (!ipCheck.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(ipCheck));
    const keyCheck = rateLimitCheck(`session:order-create:${user.id}`, orderCreateLimit());
    if (!keyCheck.allowed) return json({ message: "Too many requests" }, 429, rateLimitHeaders(keyCheck));
    const body = await readJson(req);
    const data = parseBody(createOrderDashboardSchema, body);
    if (data.payment_account_id != null) {
      const check = depsOr(deps.accountOwnerCheck, () => assertAccountOwnedBy);
      await check(user.id, data.payment_account_id);
    }
    const idemKey = req.headers.get("Idempotency-Key") ?? req.headers.get("X-Idempotency-Key") ?? null;
    const store = depsOr(deps.idempotencyStore, () => defaultIdempotencyStore());
    if (idemKey) {
      const replay = await checkIdempotency(store, `${user.id}:${idemKey}`, body);
      if (replay) return json(replay.body, replay.status);
    }
    const createOrderFn = depsOr(deps.createOrderFn, () => createOrder);
    return await finishCreate({
      userId: user.id, environment: "live", amount: data.amount,
      clientOrderId: undefined, paymentAccountId: data.payment_account_id ?? null,
      customerName: data.customer_name ?? null, customerEmail: null,
      customerMobile: data.customer_mobile ?? null, note: data.note ?? null,
      redirectUrl: null,
    }, idemKey, body, store, createOrderFn);
  } catch (e) { return handleError(e); }
}

/** POST dispatch: API-key headers present → API-key mode, else session mode. */
export async function handleCreateOrderDispatch(req: Request, deps: CreateOrderDeps = {}) {
  if (req.headers.get("x-api-key")) return handleCreateOrder(req);
  return handleCreateOrderSession(req, deps);
}
