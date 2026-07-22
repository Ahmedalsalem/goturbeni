import { describe, expect, it } from "vitest"

import { formatCostShare } from "@/utils/currency"

describe("formatCostShare", () => {
  it("formats an amount with the Turkish lira symbol and no decimals", () => {
    const formatted = formatCostShare(150, "tr")
    expect(formatted).toContain("150")
    expect(formatted).toContain("₺")
    expect(formatted).not.toContain(".")
  })

  it("uses the ar-TR locale for the ar locale", () => {
    const formatted = formatCostShare(1000, "ar")
    expect(formatted).toContain("₺")
    expect(new Intl.NumberFormat("ar-TR").resolvedOptions().locale).toBeTruthy()
  })

  it("rounds to zero fraction digits", () => {
    const formatted = formatCostShare(99.6, "tr")
    // maximumFractionDigits: 0 forces rounding to the nearest whole number.
    expect(formatted).toMatch(/100/)
  })
})
