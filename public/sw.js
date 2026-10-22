/*
 * WickedHome service worker: makes the app installable as a home screen app and lets it open without
 * a connection.
 * - Page loads: network first; offline, the cached app shell opens and the app shows its own errors.
 * - Hashed build files (/assets/*): cache first, they never change under the same name.
 * - API calls and everything else: always the network, never cached (household data stays fresh).
 * - Push messages (docs/NOTIFICATIONS.md): shown as a notification; tapping it focuses an open WickedHome
 *   window on its page, or opens one.
 * Bump VERSION to drop old caches (and to roll out a changed worker).
 */
const VERSION = "v2";
const SHELL_CACHE = `wh-shell-${VERSION}`;
const ASSET_CACHE = `wh-assets-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/brand/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("wh-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const putInCache = (cacheName, key, response) => {
  const copy = response.clone();
  void caches.open(cacheName).then((cache) => cache.put(key, copy));
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Every route serves the same index.html, so one cached copy covers them all.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) putInCache(SHELL_CACHE, "/", response);
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) putInCache(ASSET_CACHE, request, response);
            return response;
          }),
      ),
    );
  }
});

// ── Push notifications ────────────────────────────────────────────────────────────────────────────────
// The server (src/api/notifications) sends an encrypted JSON payload:
// { id, kind, title, body, url, tag, urgent, unread }. Every push must show a notification (browsers
// require it), so a payload that can't be read still shows a generic one.

const sameOriginPath = (url) => {
  try {
    const parsed = new URL(url || "/notifications", self.location.origin);
    return parsed.origin === self.location.origin ? parsed.pathname + parsed.search + parsed.hash : "/notifications";
  } catch {
    return "/notifications";
  }
};

self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  const title = message.title || "WickedHome";
  const options = {
    body: message.body || "",
    icon: "/brand/icon-192.png",
    badge: "/brand/badge-96.png",
    // Same tag: a newer notification replaces the older one instead of stacking up.
    tag: message.tag || undefined,
    renotify: Boolean(message.tag),
    requireInteraction: Boolean(message.urgent),
    timestamp: Date.now(),
    data: { url: sameOriginPath(message.url), id: message.id || null },
  };
  const badge =
    typeof message.unread === "number" && "setAppBadge" in self.navigator
      ? self.navigator.setAppBadge(message.unread).catch(() => undefined)
      : Promise.resolve();
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/notifications";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      // Prefer a window already on that page, then any WickedHome window (navigated there), else a new one.
      const exact = windows.find((client) => client.url === target);
      if (exact) return exact.focus();
      const any = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (any) {
        await any.focus();
        return "navigate" in any ? any.navigate(target).catch(() => self.clients.openWindow(target)) : self.clients.openWindow(target);
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The browser replaced the subscription (keys rotated, expired): register the new one with the server (the
// app also re-registers on its next start; the old endpoint answers 410 and is removed by the server).
self.addEventListener("pushsubscriptionchange", (event) => {
  const subscription = event.newSubscription;
  if (!subscription) return;
  event.waitUntil(
    fetch("/api/notifications/devices", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-WickedHome": "1" },
      body: JSON.stringify(subscription.toJSON()),
    }).catch(() => undefined),
  );
});
