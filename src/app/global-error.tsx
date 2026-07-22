"use client"

import { useEffect } from "react"

import { logError } from "@/lib/logger"

// Next.js only mounts this when an error is thrown inside the root layout
// itself (error.tsx doesn't catch those) — it must render its own <html>/
// <body> and can't depend on providers from the layout that just crashed
// (e.g. next-intl), so the copy here is static rather than translated.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logError(error, "app.global-error-boundary")
  }, [error])

  return (
    <html lang="tr">
      <body>
        <div style={{ maxWidth: 28 + "rem", margin: "6rem auto", padding: "0 1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Bir şeyler ters gitti</h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>Lütfen sayfayı yeniden yüklemeyi deneyin.</p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  )
}
