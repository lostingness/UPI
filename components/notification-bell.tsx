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
// ROUND 9 — delivery + clear fixes:
// (a) "Clear all" is a real server-side DELETE (see lib/notifications.ts
// `clearNotifications`): mark-as-read alone could never remove a row, and
// the list returns read rows too, so "cleared" notifications reappeared on
// every reload. A generation counter also guards the 15 s poll: a GET that
// started BEFORE a clear/mark-all-read resolves after it must not resurrect
// the pre-clear list (stale-response race).
// (b) The 15 s poll alone was the only refresh: a tab left in the
// background (timers throttled) came back stale, and opening the panel
// showed the last polled snapshot. The bell now also refetches the moment
// the panel opens, when the tab becomes visible again, on window focus,
// and when the network reconnects. A failed fetch no longer leaves the
// "Loading…" spinner forever — it shows a retry state instead.
// (c) Mobile-style centre: "Clear all" (two-tap confirm — deletion is
// permanent) + "Mark all read", unread dot + semibold unread titles, badge
// count, empty state. Open/close + item-entrance animations, all disabled
// under prefers-reduced-motion.
//
// NOT mounted by this file — the final integration worker mounts it into
// the nav slot (see the Round 5 mount instructions).
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { apiFetch, postApi } from "./api";
import { installGestureUnlock, playOrderCreatedTick } from "@/lib/sounds";
import { installMp3GestureUnlock, playTxnSuccessMp3 } from "@/lib/mp3-sounds";
import type { NotificationType } from "@/lib/notifications";

// Local INR formatter (the server copy lives in lib/notifications.ts —
// this client component must not import that server module).
function formatInr(amount: number | string): string {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const NOTIFY_PERMISSION_ASKED_KEY = "upi-notify-permission-asked";
const POLL_MS = 15_000;
// Exit animation length (must match --notif-panel-out in NOTIF_CSS).
const CLOSE_MS = 150;
// Two-tap "Clear all" confirm window.
const CLEAR_ARM_MS = 3000;

// Panel + item animations. All disabled under prefers-reduced-motion.
// The panel mounts on open, so the "in" animation runs once per open;
// list items animate on mount only (React reuses existing <li> nodes
// across polls, so a poll never replays the entrance — a genuinely new
// notification mounts fresh and slides in).
const NOTIF_CSS = `
@keyframes notif-panel-in { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes notif-panel-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-6px) scale(.98); } }
@keyframes notif-item-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.notif-panel-open { animation: notif-panel-in .18s ease-out both; transform-origin: top right; }
.notif-panel-closing { animation: notif-panel-out .15s ease-in both; transform-origin: top right; }
.notif-item-enter { animation: notif-item-in .22s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .notif-panel-open, .notif-panel-closing, .notif-item-enter { animation: none; }
}
`;

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
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<number> | null>(null); // null = first snapshot not taken yet
  // Round 9 (a): bumped on every clear / mark-all-read. A poll response
  // that started before the bump is stale and must not resurrect the
  // pre-clear list — without this, a GET in flight during a DELETE could
  // put every "cleared" notification back on screen.
  const generationRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelElRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const clearArmTimerRef = useRef<number | null>(null);
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

  const openPanel = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setPanelStyle(computePanelStyle());
    setOpen(true);
    setActionError(null);
    // Round 9 (b): the panel shows the last polled snapshot — fetch fresh
    // the moment it opens so a just-arrived payment is already there.
    void fetchNotificationsRef.current();
  }, [computePanelStyle]);

  const closePanel = useCallback(() => {
    if (closeTimerRef.current !== null) return; // already closing
    setClearArmed(false);
    if (clearArmTimerRef.current !== null) {
      window.clearTimeout(clearArmTimerRef.current);
      clearArmTimerRef.current = null;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  }, []);

  const toggleOpen = useCallback(() => {
    if (open) closePanel();
    else openPanel();
  }, [open, openPanel, closePanel]);

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

  // Clear any pending close timer if the component unmounts mid-animation.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (clearArmTimerRef.current !== null) window.clearTimeout(clearArmTimerRef.current);
    };
  }, []);

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
        // Round 7: MP3 success sound (falls back to the synth chime).
        playTxnSuccessMp3();
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
    const gen = generationRef.current;
    const res = await apiFetch<NotificationsResponse>("/api/notifications?limit=20");
    if (!res.ok || !res.data) {
      // Round 9 (b): a failed fetch used to leave "Loading…" on screen
      // forever (setLoading(false) only ran on success). Show a retry
      // state instead and keep the last good list.
      setLoadError(true);
      setLoading(false);
      return;
    }
    // Stale-response guard (Round 9 (a)): a GET that started before a
    // clear / mark-all-read must not overwrite the post-clear state.
    if (generationRef.current !== gen) return;
    setLoadError(false);
    setItems(res.data.notifications);
    setUnread(res.data.unread_count);
    setLoading(false);
    alertForNew(res.data.notifications);
  }, [alertForNew]);

  // openPanel runs before fetchNotifications is defined in source order;
  // keep a ref so it always calls the latest fetch.
  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;

  useEffect(() => {
    // Gesture-gate audio for the whole page, and ask for browser
    // notification permission once, on the merchant's first interaction.
    installGestureUnlock();
    installMp3GestureUnlock();
    const askOnce = () => {
      void requestNotificationPermissionOnce();
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
    };
    window.addEventListener("pointerdown", askOnce, { passive: true });
    window.addEventListener("keydown", askOnce);
    void fetchNotifications();
    const id = window.setInterval(() => void fetchNotifications(), POLL_MS);
    // Round 9 (b): the 15 s poll is throttled to ~1/min in a background
    // tab, so a merchant returning to the tab saw a stale badge/list for
    // minutes. Refetch the moment the tab is visible again, the window
    // regains focus, or the network reconnects.
    const refetchWhenVisible = () => {
      if (!document.hidden) void fetchNotifications();
    };
    const refetchOnFocus = () => void fetchNotifications();
    document.addEventListener("visibilitychange", refetchWhenVisible);
    window.addEventListener("focus", refetchOnFocus);
    window.addEventListener("online", refetchOnFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", askOnce);
      window.removeEventListener("keydown", askOnce);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      window.removeEventListener("focus", refetchOnFocus);
      window.removeEventListener("online", refetchOnFocus);
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
      closePanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closePanel]);

  const markAllRead = async () => {
    const res = await postApi<{ marked_read: number }>("/api/notifications", { all: true });
    if (res.ok) {
      // Bump the generation so a poll that started before this POST
      // cannot restore the pre-read badge, then confirm server state.
      generationRef.current += 1;
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setActionError(null);
      void fetchNotifications();
    } else {
      setActionError(res.message ?? "Could not mark notifications as read. Try again.");
    }
  };

  const markOneRead = async (id: number) => {
    const res = await postApi<{ marked_read: number }>("/api/notifications", { ids: [id] });
    if (res.ok) {
      // Decrement by what the server actually marked (0 when the row was
      // already read elsewhere), not a blind -1.
      const marked = res.data?.marked_read ?? 0;
      setUnread((u) => Math.max(0, u - marked));
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    }
  };

  // Round 9 (a): permanently delete every notification for this merchant
  // (server-side DELETE, per user). Two taps: the first arms the button
  // for 3 s ("Tap again to clear") because deletion cannot be undone.
  const clearAll = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      setActionError(null);
      if (clearArmTimerRef.current !== null) window.clearTimeout(clearArmTimerRef.current);
      clearArmTimerRef.current = window.setTimeout(() => {
        clearArmTimerRef.current = null;
        setClearArmed(false);
      }, CLEAR_ARM_MS);
      return;
    }
    if (clearArmTimerRef.current !== null) {
      window.clearTimeout(clearArmTimerRef.current);
      clearArmTimerRef.current = null;
    }
    setClearArmed(false);
    setClearing(true);
    const res = await postApi<{ cleared: number }>("/api/notifications", { all: true }, "DELETE");
    setClearing(false);
    if (res.ok) {
      // Bump the generation FIRST so an in-flight poll cannot resurrect
      // the deleted rows, then reset local state and confirm from the
      // server. Future notifications are genuinely new ids, so the seen
      // set resets — a payment arriving after the clear still chimes.
      generationRef.current += 1;
      seenIdsRef.current = new Set();
      setItems([]);
      setUnread(0);
      setActionError(null);
      void fetchNotifications();
    } else {
      setActionError(res.message ?? "Could not clear notifications. Try again.");
    }
  };

  return (
    <div ref={panelRef} className="relative shrink-0">
      <style>{NOTIF_CSS}</style>
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
          className={`overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--border)] ${closing ? "notif-panel-closing" : "notif-panel-open"}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h2 className="shrink-0 text-sm font-semibold text-[var(--text)]">Notifications</h2>
            <div className="flex min-w-0 items-center gap-3">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="shrink-0 text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={clearing}
                  aria-live="polite"
                  className={`shrink-0 text-xs font-medium hover:underline disabled:opacity-50 ${clearArmed ? "font-semibold text-red-700 dark:text-red-400" : "text-[var(--muted)]"}`}
                >
                  {clearing ? "Clearing…" : clearArmed ? "Tap again to clear" : "Clear all"}
                </button>
              )}
            </div>
          </div>
          {actionError && (
            <p role="alert" className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs text-red-700 dark:text-red-400">
              {actionError}
            </p>
          )}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Loading…</p>
            ) : loadError && items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-[var(--text)]">Couldn&apos;t load notifications</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Check your connection and try again.
                </p>
                <button
                  type="button"
                  onClick={() => void fetchNotifications()}
                  className="mt-3 text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-[var(--text)]">No notifications yet</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  Payment received, new orders, UTR submissions and expiries will show up here.
                </p>
              </div>
            ) : (
              <ul>
                {items.map((n, i) => (
                  <li
                    key={n.id}
                    style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                    className={`notif-item-enter border-b border-[var(--border)] last:border-b-0 ${n.is_read ? "" : "bg-[var(--surface-2)]"}`}
                  >
                    <Link
                      href={n.order_no ? `/orders/${n.order_no}` : "/orders"}
                      onClick={() => {
                        closePanel();
                        if (!n.is_read) void markOneRead(n.id);
                      }}
                      className="block px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`flex min-w-0 items-start gap-1.5 text-[13px] leading-snug text-[var(--text)] ${n.is_read ? "font-medium" : "font-semibold"}`}>
                          {!n.is_read && (
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-strong)]" aria-hidden="true" />
                          )}
                          <span className="min-w-0">{n.title}</span>
                        </p>
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
