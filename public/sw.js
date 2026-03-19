// ControlledChaos Service Worker — Offline + Push Notifications

const CACHE_NAME = "cc-shell-v1";
const SHELL_ASSETS = ["/dashboard", "/dump", "/tasks", "/calendar", "/settings"];

// Cache app shell on install — non-critical, don't block SW activation
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// Network-first with cache fallback for navigation requests
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(event.request)
        .then((cached) => cached || caches.match("/dashboard"))
    )
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push event received", event.data ? "with data" : "no data");

  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
    console.log("[SW] Push payload:", payload);
  } catch {
    payload = {
      title: "ControlledChaos",
      body: event.data.text(),
      url: "/dashboard",
    };
  }

  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "cc-notification",
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.title || "ControlledChaos",
      options
    ).then(() => {
      console.log("[SW] showNotification called successfully");
    }).catch((err) => {
      console.error("[SW] showNotification failed:", err);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
