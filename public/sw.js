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
