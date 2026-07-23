// Minimal, intentionally "basic-level" offline support (per the Faz 7 PWA
// requirement): caches only the /offline fallback page and serves it when a
// navigation request fails with no network. It does not attempt to cache or
// serve the rest of the app offline — the app's content is Supabase-backed
// and dynamic, so a full offline experience is out of scope here.
const CACHE_NAME = "goturbeni-offline-v1"
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
  }
})

// Web Push (VAPID) — payload is the JSON string built in src/lib/notifications.ts.
self.addEventListener("push", (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.endsWith(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
