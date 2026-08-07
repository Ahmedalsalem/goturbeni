import { TURKISH_PROVINCES, type TurkishProvince } from "./turkish-provinces"

// Mapped explicitly rather than via toLowerCase(): JS lowercases "İ" to "i̇"
// (i + U+0307 combining dot), which would leak a combining mark into URLs.
const TURKISH_CHARS: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
}

export function slugifyProvince(province: string): string {
  return Array.from(province)
    .map((char) => TURKISH_CHARS[char] ?? char)
    .join("")
    .toLowerCase()
}

// Every Turkish province is a single hyphen-free word, so "<from>-<to>" splits
// unambiguously on the only hyphen in the slug.
const PROVINCE_BY_SLUG: Record<string, TurkishProvince> = Object.fromEntries(
  TURKISH_PROVINCES.map((province) => [slugifyProvince(province), province])
)

export function buildRouteSlug(from: TurkishProvince, to: TurkishProvince): string {
  return `${slugifyProvince(from)}-${slugifyProvince(to)}`
}

export function parseRouteSlug(slug: string): { from: TurkishProvince; to: TurkishProvince } | null {
  const parts = slug.split("-")
  if (parts.length !== 2) return null

  const from = PROVINCE_BY_SLUG[parts[0]]
  const to = PROVINCE_BY_SLUG[parts[1]]
  if (!from || !to || from === to) return null

  return { from, to }
}
