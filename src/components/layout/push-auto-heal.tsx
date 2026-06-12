"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { ensurePushSubscription } from "@/lib/push/sync-subscription";

/**
 * App-wide push subscription auto-heal.
 *
 * Web Push subscriptions rotate on the browser/push-service's own schedule.
 * When that happens the stored subscription goes dead and — without this —
 * notifications silently stop until the user manually toggles them off/on.
 *
 * Mounted in the authenticated (app) layout so it runs on EVERY authenticated
 * load (not just the Settings page, which is the only place usePushSubscription
 * mounts). On each load it reconciles the client subscription against the
 * server and silently repairs drift. Pairs with the `pushsubscriptionchange`
 * handler in public/sw.js — that catches rotations live; this is the
 * cross-browser safety net for browsers where that event never fires.
 *
 * Renders nothing. Never prompts: ensurePushSubscription no-ops unless
 * notification permission is already granted.
 */
export function PushAutoHeal() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (cancelled) return;
        return ensurePushSubscription(reg);
      })
      .catch((err) => {
        console.error("[Push] auto-heal failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  return null;
}
