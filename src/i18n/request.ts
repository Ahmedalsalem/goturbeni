import { getRequestConfig } from "next-intl/server"

import { getUserLocale } from "@/i18n/locale"
import { isSupportedLocale } from "@/i18n/locale-config"

// An explicit getTranslations({ locale }) — every email, rendered in the
// recipient's language rather than the request's — arrives here as `locale`;
// ignoring it sent every AR/EN email in the cookie locale (Turkish for cron
// requests, which carry no cookie).
export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale = isSupportedLocale(explicitLocale) ? explicitLocale : await getUserLocale()

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Without this, date/time formatting (ride departure times, etc.)
    // silently uses the runtime's default timezone — the local dev server
    // happens to inherit the developer's machine, but Vercel's production
    // runtime defaults to UTC, which showed times 3 hours off from what
    // users actually entered. This app has one target timezone regardless
    // of where it runs.
    timeZone: "Europe/Istanbul",
  }
})
