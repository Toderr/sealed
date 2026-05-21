"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read?: boolean;
};

export function NotificationMenu({ wallet }: { wallet: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!wallet) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/notifications", { headers: { "x-wallet": wallet } });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to load notifications.");
        setNotifications([]);
        return;
      }
      setNotifications(data.notifications ?? []);
    } catch {
      setError("Unable to load notifications.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void loadNotifications();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={!wallet}
        aria-label="Open notifications"
        aria-expanded={open}
        className="relative h-9 w-9 rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning ring-2 ring-panel" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-card-border bg-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-card-border-subtle px-4 py-3">
            <p className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
              Notifications
            </p>
            {unreadCount > 0 && (
              <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center gap-1 py-8">
                {[0, 120, 240].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            ) : error ? (
              <p className="px-3 py-6 text-center text-[12px] text-danger">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted">
                Nothing needs your attention right now.
              </p>
            ) : (
              <div className="space-y-1">
                {notifications.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] text-primary" style={{ fontWeight: 510 }}>
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-subtle">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
