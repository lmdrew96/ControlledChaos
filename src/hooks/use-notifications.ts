"use client";

import { useState, useEffect, useCallback } from "react";

interface Notification {
  id: string;
  type: string;
  content: Record<string, unknown> | null;
  sentAt: string | null;
  openedAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
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

  // Fetch on mount + poll every 60 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
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

  return { notifications, unreadCount, isLoading, markAsRead, refresh };
}
