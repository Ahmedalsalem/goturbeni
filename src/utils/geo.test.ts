import { describe, expect, it } from "vitest"

import { haversineMeters } from "@/utils/geo"

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(41.0082, 28.9784, 41.0082, 28.9784)).toBe(0)
  })

  it("matches the known ~350km straight-line distance between Istanbul and Ankara", () => {
    const distance = haversineMeters(41.0082, 28.9784, 39.9334, 32.8597)
    expect(distance).toBeGreaterThan(340_000)
    expect(distance).toBeLessThan(360_000)
  })
})
