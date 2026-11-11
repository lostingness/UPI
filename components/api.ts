// Client-side API helper — talks to the backend API routes only, using the
// backend's envelope {success, data} / {message, errors?}.
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string | null;
  errors: Record<string, string[]> | null;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, data: null, message: "Network error — could not reach the server. Check your connection and try again.", errors: null };
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    return {
      ok: false, status: res.status, data: null,
      message: typeof body.message === "string" ? body.message : `Request failed (${res.status})`,
      errors: (body.errors as Record<string, string[]> | undefined) ?? null,
    };
  }
  const data = (body as { data?: T }).data ?? (body as T);
  return { ok: true, status: res.status, data: (data ?? null) as T | null, message: null, errors: null };
}

export function postApi<T = unknown>(path: string, body: unknown, method = "POST"): Promise<ApiResult<T>> {
  return apiFetch<T>(path, { method, body: JSON.stringify(body ?? {}) });
}
