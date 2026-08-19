import { describe, expect, it } from "vitest"

import { estimateCostSharePerSeat } from "./cost-estimate"

describe("estimateCostSharePerSeat", () => {
  it("returns 0 for a 0-seat ride (invalid/unset input state)", () => {
    expect(estimateCostSharePerSeat("Ankara", "İstanbul", 0)).toBe(0)
  })

  it("returns a positive estimate for the common 1-seat case", () => {
    expect(estimateCostSharePerSeat("Ankara", "İstanbul", 1)).toBeGreaterThan(0)
  })

  it("decreases per seat as more seats share the same total cost", () => {
    const oneSeat = estimateCostSharePerSeat("Ankara", "İstanbul", 1)
    const threeSeats = estimateCostSharePerSeat("Ankara", "İstanbul", 3)
    expect(threeSeats).toBeLessThan(oneSeat)
  })

  it("scales with distance", () => {
    const shortHop = estimateCostSharePerSeat("Kocaeli", "İstanbul", 2)
    const longHaul = estimateCostSharePerSeat("Ankara", "Van", 2)
    expect(longHaul).toBeGreaterThan(shortHop)
  })

  it("rounds to the nearest 5 TL, not fractional kuruş", () => {
    const result = estimateCostSharePerSeat("Ankara", "İstanbul", 2)
    expect(result % 5).toBe(0)
  })
})
