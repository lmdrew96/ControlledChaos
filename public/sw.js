// ControlledChaos Service Worker — Offline + Push Notifications

const CACHE_NAME = "cc-shell-v1";
const SHELL_ASSETS = ["/dashboard", "/dump", "/tasks", "/calendar", "/settings"];

// Cache app shell on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
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
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
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
    )
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
