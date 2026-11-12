// Open-redirect guard for the `?next=` redirect after login / admin
// password confirmation (components/auth-forms.tsx). Only a same-origin
// path is allowed: a single leading slash, no second slash or backslash
// (which browsers normalise to a protocol-relative cross-origin URL),
// and no control characters. Anything else falls back to the given
// default. useSearchParams() already percent-decodes the value, so
// checking the decoded string also covers %2F%2F-style encodings.
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
