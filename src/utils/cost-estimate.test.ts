import { describe, expect, it } from "vitest"

import { POPULAR_ROUTES } from "@/features/seo/route-pages"
import { estimateCostSharePerSeat } from "./cost-estimate"

describe("estimateCostSharePerSeat", () => {
  it("returns the table price for a route", () => {
    expect(estimateCostSharePerSeat("Ankara", "Kayseri")).toBe(450)
  })

  it("is the same in both directions", () => {
    expect(estimateCostSharePerSeat("İstanbul", "Ankara")).toBe(estimateCostSharePerSeat("Ankara", "İstanbul"))
  })

  it("returns null for a pair with no direct bus service", () => {
    expect(estimateCostSharePerSeat("Ardahan", "Kilis")).toBeNull()
  })

  it("prices every SEO route page", () => {
    for (const route of POPULAR_ROUTES) {
      expect(estimateCostSharePerSeat(route.from, route.to)).toBeGreaterThan(0)
    }
  })
})
