"use client";

import { useState, useEffect, useCallback } from "react";

// Five minutes, and only while the tab is visible. A 60s poll on a
// backgrounded tab was the largest single source of Vercel Fluid CPU: every
// tick paid Clerk edge middleware plus a function invocation to tell a bell
// nobody was looking at that nothing had changed.
const POLL_MS = 5 * 60_000;

export interface NotificationItem {
  id: string;
  type: string;
  content: Record<string, unknown> | null;
  sentAt: string | null;
  openedAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently fail — notification bell is non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount, then poll only while the tab is visible.
  useEffect(() => {
    void refresh();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };

    const interval = setInterval(tick, POLL_MS);
    // Doubles as the "user came back to this tab" refresh: returning fires an
    // immediate fetch rather than waiting out the interval, which is what
    // keeps the slower cadence unnoticeable.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId }),
        });

        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, openedAt: new Date().toISOString() }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Non-critical
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch("/api/notifications", { method: "PUT" });
      setNotifications((prev) =>
        prev.map((n) =>
          n.openedAt ? n : { ...n, openedAt: new Date().toISOString() }
        )
      );
      setUnreadCount(0);
    } catch {
      // Non-critical
    }
  }, []);

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, refresh };
}
