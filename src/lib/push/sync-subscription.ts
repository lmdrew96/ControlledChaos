/**
 * Shared client-side push helpers.
 *
 * Used by the app-wide auto-heal component (PushAutoHeal). The service worker
 * (public/sw.js) carries its own copy of urlBase64ToUint8Array because it's a
 * static file and can't import from the app bundle.
 */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Reconcile the client's push subscription against the server, repairing drift
 * in either direction:
 *   - subscription lost/rotated (getSubscription() === null) → mint a fresh one
 *   - subscription present → re-sync it (idempotent upsert) so a server row that
 *     was pruned (e.g. by the 410/404 cleanup) is recreated
 *
 * Only acts when notification permission is already `granted`, so it NEVER
 * triggers an unsolicited permission prompt. Returns true if the server now
 * holds a current subscription.
 */
export async function ensurePushSubscription(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return false;
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — cannot auto-heal");
    return false;
  }

  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    // Subscription was rotated/invalidated by the browser. Re-create it.
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const res = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
    }),
  });

  return res.ok;
}
