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
    // Store everything we need for action handlers in data
    data: {
      url: payload.url || "/dashboard",
      userId: payload.userId,
      taskId: payload.taskId,
      tag: payload.tag,
      title: payload.title,
      body: payload.body,
      locationName: payload.locationName,
    },
    // Action buttons — silently ignored on iOS/Firefox where not supported
    actions: payload.actions || [],
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

  const { url, userId, taskId, tag, title, body, locationName } = event.notification.data || {};
  const action = event.action;

  // Snooze: call the API to queue a re-send in 30 min, no navigation
  if (action === "snooze" && userId) {
    event.waitUntil(
      fetch("/api/notifications/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title, body, url, tag, minutes: 30 }),
      }).catch(console.error)
    );
    return;
  }

  // Determine where to navigate
  const navigateTo =
    action === "brain_dump" ? "/dump"
    : action === "see_tasks" ? "/tasks"
    : action === "see_location_tasks" && locationName ? `/tasks?location=${encodeURIComponent(locationName)}`
    : action === "start_task" && taskId ? `/tasks?taskId=${taskId}`
    : url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(navigateTo);
            return client.focus();
          }
        }
        return self.clients.openWindow(navigateTo);
      })
  );
});
