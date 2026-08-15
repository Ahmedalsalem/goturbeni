import { describe, expect, it } from "vitest"

import { estimateCo2SavingsKg } from "./co2-savings"

describe("estimateCo2SavingsKg", () => {
  it("returns 0 for a 1-seat booking (no additional passenger to share with)", () => {
    // distance × factor × (1 / (1+1)) is still > 0 mathematically, but the
    // point of "savings" is meaningless for a solo trip with no one else
    // sharing it — seatCount here means seats actually booked by OTHER
    // people sharing the ride with the driver, so 0 booked seats means 0 savings.
    expect(estimateCo2SavingsKg("Ankara", "İstanbul", 0)).toBe(0)
  })

  it("scales with distance and booked seat count", () => {
    const oneSeat = estimateCo2SavingsKg("Ankara", "İstanbul", 1)
    const twoSeats = estimateCo2SavingsKg("Ankara", "İstanbul", 2)
    expect(oneSeat).toBeGreaterThan(0)
    expect(twoSeats).toBeGreaterThan(oneSeat)
  })

  it("returns a rounded number of kg, not fractional grams", () => {
    const result = estimateCo2SavingsKg("Ankara", "İstanbul", 2)
    expect(Number.isInteger(result)).toBe(true)
  })
})
