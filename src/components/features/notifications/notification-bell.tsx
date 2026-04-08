"use client";

import { useState } from "react";
import { Bell, Mail, Zap, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function getNotificationIcon(type: string) {
    switch (type) {
      case "push":
        return <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
      case "email":
        return <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
      default:
        return <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    }
  }

  function getNotificationTitle(n: {
    type: string;
    content: Record<string, unknown> | null;
  }): string {
    const content = n.content;
    if (content?.title && typeof content.title === "string") return content.title;
    if (content?.type === "morning_digest") return "Morning Digest";
    if (content?.type === "evening_digest") return "Evening Digest";
    return "Notification";
  }

  function getNotificationBody(n: {
    content: Record<string, unknown> | null;
  }): string {
    const content = n.content;
    if (content?.body && typeof content.body === "string") return content.body;
    return "";
  }

  function getNotificationUrl(n: {
    content: Record<string, unknown> | null;
  }): string | null {
    const content = n.content;
    if (content?.url && typeof content.url === "string") return content.url;
    return null;
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const recent = notifications.slice(0, 20);

  return (
    <Popover onOpenChange={() => setExpandedId(null)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
              aria-live="polite"
              aria-atomic="true"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] sm:w-80 p-0 backdrop-blur-xl"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {recent.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          )}

          {recent.map((n) => {
            const isExpanded = expandedId === n.id;
            const body = getNotificationBody(n);
            const url = getNotificationUrl(n);

            return (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.openedAt) markAsRead(n.id);
                  setExpandedId(isExpanded ? null : n.id);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  !n.openedAt && "bg-accent/20"
                )}
              >
                <div className="mt-0.5">{getNotificationIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {getNotificationTitle(n)}
                  </p>
                  {body && (
                    <p
                      className={cn(
                        "text-xs text-muted-foreground mt-0.5 transition-all",
                        !isExpanded && "line-clamp-2"
                      )}
                    >
                      {body}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(n.sentAt ?? n.createdAt)}
                    </p>
                    {isExpanded && url && (
                      <span
                        role="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(url);
                        }}
                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline cursor-pointer"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
                {!n.openedAt && (
                  <div className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
