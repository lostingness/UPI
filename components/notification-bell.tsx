// Merchant notification centre — bell icon with unread badge + dropdown
// panel (Round 5). Polls GET /api/notifications every 15 s, so new paid /
// order events appear without a reload. The bell is the dashboard's live
// alert path: when polling sees a NEW `payment_received` notification (one
// that was not in the first snapshot after mount) it plays the success
// chime and shows a native browser notification "Payment received ₹X.XX";
// a new `order_created` plays the soft tick. Both fire ONLY for
// server-created notifications — never on page load, never fake.
//
// BROWSER NOTIFICATION PERMISSION: asked once, only from a dashboard page
// (this component is mounted in the dashboard nav), only after the
// merchant's first interaction on the page (a gesture), and only when the
// browser still reports `default`. The ask is recorded in localStorage
// (`upi-notify-permission-asked`) so it never nags. If permission is
// denied, the component stays silent and the in-app bell keeps working.
//
// NOT mounted by this file — the final integration worker mounts it into
// the nav slot (see the Round 5 mount instructions).
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { apiFetch, postApi } from "./api";
import { installGestureUnlock, playOrderCreatedTick, playSuccessChime } from "@/lib/sounds";
import type { NotificationType } from "@/lib/notifications";

// Local INR formatter (the server copy lives in lib/notifications.ts —
// this client component must not import that server module).
function formatInr(amount: number | string): string {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const NOTIFY_PERMISSION_ASKED_KEY = "upi-notify-permission-asked";
const POLL_MS = 15_000;

export interface NotificationItem {
  id: number;
  order_id: number | null;
  order_no: string | null;
  type: NotificationType;
  title: string;
  body: string;
  amount: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unread_count: number;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/**
 * Ask for browser-notification permission ONCE, and only from a user
 * gesture (browsers ignore or auto-deny gesture-less prompts). Returns
 * the resulting permission, "unsupported" when the API is absent, or
 * "already-asked" when this browser already answered once. Never nags:
 * after one ask the localStorage flag stops all future asks.
 */
export async function requestNotificationPermissionOnce(): Promise<
  NotificationPermission | "unsupported" | "already-asked"
> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    if (window.localStorage.getItem(NOTIFY_PERMISSION_ASKED_KEY) === "1") return "already-asked";
  } catch {
    return "already-asked";
  }
  try {
    window.localStorage.setItem(NOTIFY_PERMISSION_ASKED_KEY, "1");
  } catch {
    /* storage unavailable — still ask this once, never again this session is not guaranteed */
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Show a native browser notification. Silent no-op unless permission was
 * granted. `tag` dedupes repeat notifications for the same order.
 */
export function showBrowserNotification(title: string, body: string, tag: string): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const n = new Notification(title, { body, tag, silent: false });
    // Auto-close after 8 s so a stack of payment alerts never lingers.
    setTimeout(() => n.close(), 8000);
    return true;
  } catch {
    return false;
  }
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const seenIdsRef = useRef<Set<number> | null>(null); // null = first snapshot not taken yet
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelElRef = useRef<HTMLDivElement>(null);
  // ROUND 6 BUG 2 FIX — viewport-clamped panel position. The old panel
  // was `absolute right-0` inside the pill: at 390px the bell sits near
  // the middle of the pill, so a 352px-wide right-anchored panel ran
  // ~220px past the LEFT viewport edge and its text was cut. A plain
  // `position:fixed` inside the pill would NOT fix it either — the pill
  // uses backdrop-filter, which becomes the containing block for fixed
  // descendants. The panel is therefore portalled to document.body and
  // positioned from the bell's measured rect, clamped to the viewport:
  // mobile (<=820px) it is a full-width sheet (16px gutters, below the
  // nav); desktop it stays anchored to the bell but can never leave the
  // viewport. Recomputed on open, resize and scroll.
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const computePanelStyle = useCallback((): CSSProperties => {
    const fallback: CSSProperties = { position: "fixed", left: 16, right: 16, top: 80, zIndex: 70 };
    if (typeof window === "undefined") return fallback;
    const btn = buttonRef.current;
    if (!btn) return fallback;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    if (vw <= 820) {
      return { position: "fixed", left: 16, right: 16, top: Math.max(80, Math.ceil(r.bottom) + 12), zIndex: 70 };
    }
    const width = Math.min(360, vw - 32);
    const left = Math.min(Math.max(16, r.right - width), vw - width - 16);
    return { position: "fixed", left, width, top: Math.ceil(r.bottom) + 8, zIndex: 70 };
  }, []);

  const toggleOpen = useCallback(() => {
    if (!open) setPanelStyle(computePanelStyle());
    setOpen(!open);
  }, [open, computePanelStyle]);

  // Keep the panel clamped while it is open (rotation, resize, scroll).
  useEffect(() => {
    if (!open) return;
    const update = () => setPanelStyle(computePanelStyle());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, computePanelStyle]);

  // Alert on genuinely NEW server-confirmed events only: compare each
  // poll against the snapshot taken at mount. Items in the first snapshot
  // (already there when the page loaded) never chime.
  const alertForNew = useCallback((fresh: NotificationItem[]) => {
    const seen = seenIdsRef.current;
    if (seen === null) {
      seenIdsRef.current = new Set(fresh.map((n) => n.id));
      return;
    }
    for (const n of fresh) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (n.type === "payment_received") {
        playSuccessChime();
        showBrowserNotification(
          `Payment received ${n.amount ? formatInr(n.amount) : ""}`.trim(),
          n.title,
          `upi-payment-${n.order_no ?? n.id}`,
        );
      } else if (n.type === "order_created") {
        playOrderCreatedTick();
      }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const res = await apiFetch<NotificationsResponse>("/api/notifications?limit=20");
    if (!res.ok || !res.data) return;
    setItems(res.data.notifications);
    setUnread(res.data.unread_count);
    setLoading(false);
    alertForNew(res.data.notifications);
  }, [alertForNew]);

  useEffect(() => {
    // Gesture-gate audio for the whole page, and ask for browser
    // notification permission once, on the merchant's first interaction.
    installGestureUnlock();
    const askOnce = () => {
      void requestNotificationPermissionOnce();
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
    };
    window.addEventListener("pointerdown", askOnce, { passive: true });
    window.addEventListener("keydown", askOnce);
    void fetchNotifications();
    const id = window.setInterval(() => void fetchNotifications(), POLL_MS);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
    };
  }, [fetchNotifications]);

  // Close the panel on outside click / Escape. The panel is portalled to
  // document.body, so it is NOT inside panelRef — check both refs.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (panelElRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const markAllRead = async () => {
    const res = await postApi<{ marked_read: number }>("/api/notifications", { all: true });
    if (res.ok) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const markOneRead = async (id: number) => {
    const res = await postApi<{ marked_read: number }>("/api/notifications", { ids: [id] });
    if (res.ok) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    }
  };

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        style={{ touchAction: "manipulation" }}
        className="relative grid h-9 w-9 touch-manipulation place-items-center rounded-full transition-colors duration-150 hover:bg-[var(--surface-2)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent-strong)] px-1 font-mono text-[10px] font-semibold leading-none text-[var(--accent-ink)]"
            aria-hidden="true"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelElRef}
          role="dialog"
          aria-label="Notifications"
          style={panelStyle ?? { position: "fixed", left: 16, right: 16, top: 80, zIndex: 70 }}
          className="overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-[var(--text)]">No notifications yet</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Payment received, new orders, UTR submissions and expiries will show up here.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className={`border-b border-[var(--border)] last:border-b-0 ${n.is_read ? "" : "bg-[var(--surface-2)]"}`}>
                    <Link
                      href={n.order_no ? `/orders/${n.order_no}` : "/orders"}
                      onClick={() => {
                        setOpen(false);
                        if (!n.is_read) void markOneRead(n.id);
                      }}
                      className="block px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium leading-snug text-[var(--text)]">{n.title}</p>
                        <span className="shrink-0 font-mono text-[11px] text-[var(--faint)]">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{n.body}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
