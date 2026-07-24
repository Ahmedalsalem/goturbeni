import { SUPPORTED_LOCALES } from "@/i18n/locale-config"

// Locale switching is cookie-based with no URL prefix (see locale.ts), so
// every locale currently resolves to the same path. These tags at least
// declare language availability to crawlers — full per-language indexing
// still requires path-based routing (e.g. /tr/..., /ar/...).
export function languageAlternates(pathname: string): Record<string, string> {
  const alternates: Record<string, string> = { "x-default": pathname }
  for (const locale of SUPPORTED_LOCALES) {
    alternates[locale] = pathname
  }
  return alternates
}
