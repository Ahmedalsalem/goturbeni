"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "cookie-consent"

type Consent = "accepted" | "rejected" | null

// Calls the window.gtag() the root layout's inline script defines
// unconditionally (so Search Console's Analytics verification can find the
// snippet in the raw HTML). gtag('consent', 'update', ...) is the documented
// Consent Mode v2 API — pushing a raw array to dataLayer directly doesn't
// reliably reach gtag.js's internal consent state.
function updateAnalyticsConsent(granted: boolean) {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void }
  w.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" })
}

// Gates analytics cookies (GA) behind explicit user consent, as required by
// KVKK for non-essential cookies. gtag('config', ...) itself runs
// unconditionally from the root layout (Consent Mode v2 default: denied),
// so GA operates cookieless with no persistent identifiers until this
// component calls gtag('consent', 'update', ...) with "granted" — either
// just now or from a prior visit's stored choice.
export function CookieConsent({ gaMeasurementId }: { gaMeasurementId?: string }) {
  const t = useTranslations("CookieConsent")
  const [consent, setConsent] = useState<Consent>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "accepted" || stored === "rejected") {
      setConsent(stored)
      if (gaMeasurementId && stored === "accepted") {
        updateAnalyticsConsent(true)
      }
    }
  }, [gaMeasurementId])

  const decide = (value: "accepted" | "rejected") => {
    window.localStorage.setItem(STORAGE_KEY, value)
    setConsent(value)
    if (gaMeasurementId) {
      updateAnalyticsConsent(value === "accepted")
    }
  }

  return (
    <>
      {mounted && consent === null && (
        <div
          role="region"
          aria-label={t("label")}
          className="bg-card border-border fixed inset-x-0 bottom-0 z-50 border-t px-4 py-4 shadow-lg sm:px-6"
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {t("message")}{" "}
              <Link href="/kvkk" className="text-foreground underline underline-offset-2">
                {t("learnMore")}
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => decide("rejected")}>
                {t("reject")}
              </Button>
              <Button size="sm" onClick={() => decide("accepted")}>
                {t("accept")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
