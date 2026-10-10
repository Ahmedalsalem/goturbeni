import { describe, expect, it } from "vitest"

import { estimateCostSharePerSeat } from "./cost-estimate"

describe("estimateCostSharePerSeat", () => {
  it("returns a positive estimate", () => {
    expect(estimateCostSharePerSeat("Ankara", "İstanbul")).toBeGreaterThan(0)
  })

  it("scales with distance", () => {
    const shortHop = estimateCostSharePerSeat("Kocaeli", "İstanbul")
    const longHaul = estimateCostSharePerSeat("Ankara", "Van")
    expect(longHaul).toBeGreaterThan(shortHop)
  })

  it("rounds to the nearest 5 TL, not fractional kuruş", () => {
    const result = estimateCostSharePerSeat("Ankara", "İstanbul")
    expect(result % 5).toBe(0)
  })
})
