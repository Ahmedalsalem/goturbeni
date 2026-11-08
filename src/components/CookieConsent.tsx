"use client"

import { useEffect, useRef, useState } from "react"
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

const META_PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js"

// The root layout defines window.fbq (a queue stub, no network request) only
// when NEXT_PUBLIC_META_PIXEL_ID is set, so this is a no-op without the
// pixel. fbevents.js is fetched here, on the first grant, and not before.
function updateMetaPixelConsent(granted: boolean) {
  const w = window as unknown as { fbq?: (...args: unknown[]) => void }
  if (!w.fbq) {
    return
  }
  w.fbq("consent", granted ? "grant" : "revoke")
  if (granted && !document.querySelector(`script[src="${META_PIXEL_SRC}"]`)) {
    const script = document.createElement("script")
    script.async = true
    script.src = META_PIXEL_SRC
    document.head.appendChild(script)
  }
}

const SIGNUP_SOURCE_COOKIE = "gb_src"
const SIGNUP_SOURCE_COOKIE_MAX_AGE = 90 * 24 * 60 * 60

// First-touch attribution for the admin "kullanıcı nereden geldi" metric,
// read back by features/auth/actions.ts at signup: utm_source wins, else the
// external referrer's host, else "direct". Resolved from the page the visitor
// landed on (CookieConsent mounts once and survives client navigation), but
// only written after consent, and never overwritten once set.
function resolveLandingSource(): string {
  const utmSource = new URLSearchParams(window.location.search).get("utm_source")
  if (utmSource) {
    return utmSource.slice(0, 100)
  }
  try {
    const referrerHost = document.referrer ? new URL(document.referrer).host : ""
    if (referrerHost && referrerHost !== window.location.host) {
      return referrerHost.slice(0, 100)
    }
  } catch {
    // Malformed referrer — fall through to "direct".
  }
  return "direct"
}

function writeSignupSource(source: string) {
  if (document.cookie.split("; ").some((cookie) => cookie.startsWith(`${SIGNUP_SOURCE_COOKIE}=`))) {
    return
  }
  document.cookie = `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(source)}; max-age=${SIGNUP_SOURCE_COOKIE_MAX_AGE}; path=/; samesite=lax`
}

// Gates analytics cookies (GA), the Meta Pixel and the gb_src attribution cookie behind explicit user consent, as required by
// KVKK for non-essential cookies. gtag('config', ...) itself runs
// unconditionally from the root layout (Consent Mode v2 default: denied),
// so GA operates cookieless with no persistent identifiers until this
// component calls gtag('consent', 'update', ...) with "granted" — either
// just now or from a prior visit's stored choice.
export function CookieConsent({ gaMeasurementId }: { gaMeasurementId?: string }) {
  const t = useTranslations("CookieConsent")
  const [consent, setConsent] = useState<Consent>(null)
  const [mounted, setMounted] = useState(false)
  const landingSource = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
    landingSource.current = resolveLandingSource()
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "accepted" || stored === "rejected") {
      setConsent(stored)
      if (gaMeasurementId && stored === "accepted") {
        updateAnalyticsConsent(true)
      }
      if (stored === "accepted") {
        updateMetaPixelConsent(true)
        writeSignupSource(landingSource.current)
      }
    }
  }, [gaMeasurementId])

  const decide = (value: "accepted" | "rejected") => {
    window.localStorage.setItem(STORAGE_KEY, value)
    setConsent(value)
    if (gaMeasurementId) {
      updateAnalyticsConsent(value === "accepted")
    }
    updateMetaPixelConsent(value === "accepted")
    if (value === "accepted") {
      writeSignupSource(landingSource.current ?? resolveLandingSource())
    }
  }

  return (
    <>
      {mounted && consent === null && (
        // pointer-events-none on the banner's own padding lets taps that miss
        // the text/buttons fall through to whatever ride card or button sits
        // underneath (this bar is fixed to the viewport bottom, so it
        // otherwise sits on top of scrolled-in content for as long as it's
        // shown) — only the two children below opt back into pointer-events.
        <div
          role="region"
          aria-label={t("label")}
          className="bg-card border-border pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 shadow-lg sm:px-6"
        >
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="pointer-events-auto text-muted-foreground text-sm">
              {t("message")}{" "}
              <Link href="/kvkk" className="text-foreground underline underline-offset-2">
                {t("learnMore")}
              </Link>
            </p>
            <div className="pointer-events-auto flex shrink-0 gap-2">
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
