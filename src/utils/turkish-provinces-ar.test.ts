import { describe, expect, it } from "vitest"

import { TURKISH_PROVINCES } from "./turkish-provinces"
import { getProvincesSortedForLocale } from "./turkish-provinces-ar"

describe("getProvincesSortedForLocale", () => {
  it("sorts Turkish names with Turkish collation", () => {
    const sorted = getProvincesSortedForLocale("tr")
    expect(sorted.slice(0, 4)).toEqual(["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı"])
    expect(sorted.indexOf("Bursa")).toBeLessThan(sorted.indexOf("Çanakkale"))
    expect(sorted.indexOf("Çorum")).toBeLessThan(sorted.indexOf("Denizli"))
    expect(sorted.indexOf("Iğdır")).toBeLessThan(sorted.indexOf("İstanbul"))
    expect(sorted.indexOf("Sivas")).toBeLessThan(sorted.indexOf("Şanlıurfa"))
    expect(sorted.at(-1)).toBe("Zonguldak")
  })

  it("keeps every province exactly once in every locale", () => {
    for (const locale of ["tr", "en", "ar"]) {
      const sorted = getProvincesSortedForLocale(locale)
      expect([...sorted].sort()).toEqual([...TURKISH_PROVINCES].sort())
    }
  })

  it("sorts by the Arabic display name in Arabic", () => {
    const sorted = getProvincesSortedForLocale("ar")
    expect(sorted[0]).not.toBe("Adana")
    expect(sorted).not.toEqual(getProvincesSortedForLocale("tr"))
  })
})
