// Shared HTTP helpers for API routes.
import { NextResponse } from "next/server";
import { requestId } from "./api-auth";
import { toApiError } from "./errors";

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, { status, headers: { "X-Request-Id": requestId(), ...extraHeaders } });
}
export function ok(data: unknown, status = 200): NextResponse {
  return json({ success: true, data }, status);
}
export function handleError(e: unknown): NextResponse {
  const { status, body } = toApiError(e);
  return json(body, status);
}
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return {}; }
}
