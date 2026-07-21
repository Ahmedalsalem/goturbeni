export const LOCALE_COOKIE = "NEXT_LOCALE"
export const DEFAULT_LOCALE = "tr"
export const SUPPORTED_LOCALES = ["tr", "ar"] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(value: string | undefined): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "")
}

export function isRtlLocale(locale: string): boolean {
  return locale === "ar"
}
