"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAppVersion,
  recoverFromChunkError,
  clearChunkReloadGuard,
} from "@/lib/useAppVersion";

/**
 * Mounted once at the app root. Two jobs, deliberately separate:
 *
 * 1. A dismissible notice when this tab is running a build older than the one
 *    on the server. It never reloads on its own — this app holds unsaved brain
 *    dumps and half-filled forms, and a silent refresh mid-task is exactly the
 *    kind of thing that makes an ADHD user stop trusting the tool.
 * 2. A one-shot reload when a lazy chunk 404s after a deploy. That case is not
 *    polite-notice territory: the page is already dead.
 */
export function UpdateAvailableToast() {
  const { updateReady, applyUpdate, dismiss } = useAppVersion();

  useEffect(() => {
    // We mounted, so the build we're running is intact. Re-arm the one-shot.
    clearChunkReloadGuard();

    // React's error boundaries don't see chunk failures from non-React
    // dynamic imports or from a script tag, so listen globally too.
    const onError = (event: ErrorEvent) => {
      recoverFromChunkError(event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      recoverFromChunkError(event.reason);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (!updateReady) return null;

  return (
    // bottom-20 on mobile clears the bottom nav bar; the toast must never sit
    // on top of a primary action.
    <div
      role="status"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:bottom-4"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1 text-sm">A new version is available.</p>
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={dismiss}>
        Not now
      </Button>
      <Button size="sm" className="h-8 px-3 text-xs" onClick={applyUpdate}>
        Refresh
      </Button>
    </div>
  );
}
