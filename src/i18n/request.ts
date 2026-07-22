import { getRequestConfig } from "next-intl/server"

import { getUserLocale } from "@/i18n/locale"

export default getRequestConfig(async () => {
  const locale = await getUserLocale()

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
