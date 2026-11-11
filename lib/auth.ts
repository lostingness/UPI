// Session auth: stateless signed JWT (jose, HS256) in an httpOnly cookie.
// Decision (§5.3/§7 OPEN QUESTION resolved): stateless — no Neon `sessions`
// table. Cookie: name `upi-gateway-session`, HttpOnly, Secure in production,
// SameSite=lax, Path=/, 120-min lifetime (SESSION_LIFETIME=120).
// Payload: { sub: userId, role, ph: first 16 chars of the bcrypt password hash,
//   pc: passwordConfirmedAt epoch seconds (admin re-confirm gate) }.
// Changing the password changes `ph`, so ALL existing sessions are invalidated
// (Laravel AuthenticateSession equivalent). Logout clears the cookie.
// SESSION_SECRET must be set in production; in dev a fixed dev-only fallback is
// used and sessions are NOT trusted across restarts in prod without the secret.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getSql, first, type Row } from "./db";
import { ApiError } from "./errors";
import { gatewayConfig } from "./config/gateway";

export const SESSION_COOKIE = "upi-gateway-session";
const SESSION_MAX_AGE = 120 * 60; // seconds

function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    return new TextEncoder().encode("dev-only-session-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: number; email: string; name: string; role: "admin" | "merchant";
  isActive: boolean; passwordHashPrefix: string; passwordConfirmedAt: number | null;
  businessName: string | null;
}

export interface SessionPayload extends JWTPayload {
  sub: string; role: string; ph: string; pc?: number;
}

export async function createSessionToken(user: { id: number; role: string; password: string }, passwordConfirmedAt?: number): Promise<string> {
  return new SignJWT({ role: user.role, ph: user.password.slice(0, 16), pc: passwordConfirmedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return payload as unknown as SessionPayload;
  } catch { return null; }
}

/** Load the current session user from the cookie; returns null when absent/invalid. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;
  const sql = getSql();
  const row = first<Row>(await sql`SELECT id, name, email, role, is_active, password, business_name FROM users WHERE id = ${Number(payload.sub)}`);
  if (!row) return null;
  const password = String(row.password);
  if (!password.startsWith(String(payload.ph))) return null; // password changed → session dead
  return {
    id: Number(row.id), email: String(row.email), name: String(row.name),
    role: row.role === "admin" ? "admin" : "merchant",
    isActive: row.is_active === true,
    passwordHashPrefix: String(payload.ph),
    passwordConfirmedAt: typeof payload.pc === "number" ? payload.pc : null,
    businessName: row.business_name ? String(row.business_name) : null,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Unauthenticated");
  if (!s.isActive) throw new ApiError(403, "Your account has been disabled");
  return s;
}
export async function requireMerchant(): Promise<SessionUser> { return requireSession(); }
export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireSession();
  if (s.role !== "admin") throw new ApiError(403, "Admin access required");
  return s;
}
/** Admin routes additionally require password re-confirmation within 900 s. */
export async function requireAdminConfirmed(): Promise<SessionUser> {
  const s = await requireAdmin();
  const confirmedAt = s.passwordConfirmedAt ?? 0;
  if (Date.now() / 1000 - confirmedAt > gatewayConfig.adminPasswordConfirmSeconds) {
    throw new ApiError(401, "Password confirmation required");
  }
  return s;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, gatewayConfig.bcryptRounds);
}

/** Ownership guard: 404 (not 403) on чужой order/account, per source behaviour. */
export function assertOwns(userId: number, ownerId: number | string): void {
  // Neon returns BIGINT ids as strings — compare numerically, never ===.
  if (Number(userId) !== Number(ownerId)) throw new ApiError(404, "Not found");
}
