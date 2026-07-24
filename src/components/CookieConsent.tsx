"use client"

import { useEffect, useState } from "react"
import Script from "next/script"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "cookie-consent"

type Consent = "accepted" | "rejected" | null

// Gates analytics cookies (GA) behind explicit user consent, as required by
// KVKK for non-essential cookies. The gtag.js loader itself is inert (just
// defines window.dataLayer/gtag, sets no cookies) and is loaded unconditionally
// from the root layout so Search Console's Analytics verification can find it;
// this component only fires the gtag('config', ...) call that actually starts
// tracking and writing cookies, and only once consent is "accepted" — either
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
    }
  }, [])

  const decide = (value: "accepted" | "rejected") => {
    window.localStorage.setItem(STORAGE_KEY, value)
    setConsent(value)
  }

  return (
    <>
      {gaMeasurementId && consent === "accepted" && (
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaMeasurementId}');
          `}
        </Script>
      )}
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
