import { describe, expect, it } from "vitest"

import { parseRideSearchParams } from "@/features/rides/filters"

describe("parseRideSearchParams", () => {
  it("parses valid from/to/date/sort values", () => {
    const result = parseRideSearchParams({
      from: "Ankara",
      to: "İstanbul",
      date: "2026-01-15",
      sort: "cost_asc",
    })
    expect(result).toEqual({
      from: "Ankara",
      to: "İstanbul",
      date: "2026-01-15",
      sort: "cost_asc",
    })
  })

  it("drops an invalid province rather than throwing", () => {
    const result = parseRideSearchParams({ from: "Atlantis", to: "İstanbul" })
    expect(result.from).toBeUndefined()
    expect(result.to).toBe("İstanbul")
  })

  it("drops a malformed date", () => {
    const result = parseRideSearchParams({ date: "15-01-2026" })
    expect(result.date).toBeUndefined()
  })

  it("falls back to date_asc for an unknown or missing sort", () => {
    expect(parseRideSearchParams({}).sort).toBe("date_asc")
    expect(parseRideSearchParams({ sort: "not_a_sort" }).sort).toBe("date_asc")
  })

  it("takes the first value when a param is an array", () => {
    const result = parseRideSearchParams({ from: ["Ankara", "İstanbul"] })
    expect(result.from).toBe("Ankara")
  })

  it("keeps a district that belongs to its resolved city", () => {
    const result = parseRideSearchParams({ from: "Ankara", fromDistrict: "Çankaya" })
    expect(result.fromDistrict).toBe("Çankaya")
  })

  it("drops a district that doesn't belong to the resolved city", () => {
    const result = parseRideSearchParams({ from: "Ankara", fromDistrict: "Kadıköy" })
    expect(result.fromDistrict).toBeUndefined()
  })

  it("drops a district when its city was dropped as invalid", () => {
    const result = parseRideSearchParams({ from: "Atlantis", fromDistrict: "Çankaya" })
    expect(result.fromDistrict).toBeUndefined()
  })
})
