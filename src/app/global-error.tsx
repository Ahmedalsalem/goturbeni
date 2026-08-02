"use client"

import { useEffect, useState } from "react"

import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isRtlLocale, isSupportedLocale, type AppLocale } from "@/i18n/locale-config"

// Next.js only mounts this when an error is thrown inside the root layout
// itself (error.tsx doesn't catch those) — it must render its own <html>/
// <body> and can't depend on providers from the layout that just crashed
// (e.g. next-intl's NextIntlClientProvider), so translation here can't go
// through useTranslations(). Locale still comes through by reading the same
// cookie next-intl itself reads server-side (see i18n/locale.ts) directly,
// with a tiny self-contained copy table instead of the message catalog.
const COPY: Record<AppLocale, { title: string; description: string; reset: string }> = {
  tr: { title: "Bir şeyler ters gitti", description: "Lütfen sayfayı yeniden yüklemeyi deneyin.", reset: "Tekrar dene" },
  ar: { title: "حدث خطأ ما", description: "يرجى محاولة إعادة تحميل الصفحة.", reset: "أعد المحاولة" },
  en: { title: "Something went wrong", description: "Please try reloading the page.", reset: "Try again" },
}

function readCookieLocale(): AppLocale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))
  const value = match ? decodeURIComponent(match[1]) : undefined
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE)

  useEffect(() => {
    logError(error, "app.global-error-boundary")
    setLocale(readCookieLocale())
  }, [error])

  const t = COPY[locale]

  return (
    <html lang={locale} dir={isRtlLocale(locale) ? "rtl" : "ltr"}>
      <body>
        <div style={{ maxWidth: 28 + "rem", margin: "6rem auto", padding: "0 1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{t.title}</h1>
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>{t.description}</p>
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
            {t.reset}
          </button>
        </div>
      </body>
    </html>
  )
}
