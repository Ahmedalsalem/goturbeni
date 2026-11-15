"use client"

import { useEffect } from "react"

import { logError } from "@/lib/logger"

// Registers public/sw.js, which only exists to serve the /offline fallback
// page when a navigation request fails with no network (see that file).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        // Offline fallback is a progressive enhancement — log but don't
        // surface it to the user if registration fails. Real browsers reject
        // with an Error/DOMException; crawlers and headless renderers that
        // stub register() reject with a bare string ("Rejected"), which is
        // not actionable.
        if (error instanceof Error) {
          logError(error, "service-worker.register")
        }
      })
    }
  }, [])

  return null
}
