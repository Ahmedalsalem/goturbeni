import { describe, expect, it } from "vitest"

import { buildRouteSlug, parseRouteSlug, slugifyProvince } from "@/utils/province-slug"
import { TURKISH_PROVINCES } from "@/utils/turkish-provinces"

describe("slugifyProvince", () => {
  it("maps Turkish characters to ASCII", () => {
    expect(slugifyProvince("İstanbul")).toBe("istanbul")
    expect(slugifyProvince("Şanlıurfa")).toBe("sanliurfa")
    expect(slugifyProvince("Kahramanmaraş")).toBe("kahramanmaras")
    expect(slugifyProvince("Iğdır")).toBe("igdir")
    expect(slugifyProvince("Çanakkale")).toBe("canakkale")
    expect(slugifyProvince("Düzce")).toBe("duzce")
  })

  it("distinguishes dotted İstanbul from dotless Isparta", () => {
    expect(slugifyProvince("İstanbul")).not.toBe(slugifyProvince("Isparta"))
  })

  it("emits no combining marks for the dotted capital I", () => {
    expect(slugifyProvince("İstanbul")).toMatch(/^[a-z]+$/)
  })

  it("produces a unique lowercase ASCII slug for all 81 provinces", () => {
    const slugs = TURKISH_PROVINCES.map(slugifyProvince)
    expect(new Set(slugs).size).toBe(TURKISH_PROVINCES.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]+$/)
    }
  })
})

describe("parseRouteSlug", () => {
  it("round-trips every province pairing", () => {
    for (const from of TURKISH_PROVINCES) {
      for (const to of TURKISH_PROVINCES) {
        if (from === to) continue
        expect(parseRouteSlug(buildRouteSlug(from, to))).toEqual({ from, to })
      }
    }
  })

  it("rejects unknown provinces, wrong shapes and identical endpoints", () => {
    expect(parseRouteSlug("istanbul-atlantis")).toBeNull()
    expect(parseRouteSlug("istanbul")).toBeNull()
    expect(parseRouteSlug("istanbul-ankara-izmir")).toBeNull()
    expect(parseRouteSlug("istanbul-istanbul")).toBeNull()
    expect(parseRouteSlug("")).toBeNull()
  })
})
