import { describe, expect, it } from "vitest"

import { buildRideSchema, MAX_DESCRIPTION_LENGTH, MAX_SEAT_COUNT, MIN_SEAT_COUNT } from "@/features/rides/schemas"

const t = ((key: string) => key) as Parameters<typeof buildRideSchema>[0]

function futureDateTimeParts(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  const departureDate = date.toISOString().slice(0, 10)
  const departureTime = date.toISOString().slice(11, 16)
  return { departureDate, departureTime }
}

function validRide(overrides: Partial<Record<string, unknown>> = {}) {
  const { departureDate, departureTime } = futureDateTimeParts(24)
  return {
    departureCity: "Ankara",
    arrivalCity: "İstanbul",
    departureDate,
    departureTime,
    seatCount: 2,
    costShare: 100,
    description: undefined,
    ...overrides,
  }
}

describe("buildRideSchema", () => {
  const schema = buildRideSchema(t)

  it("accepts a fully valid ride", () => {
    const result = schema.safeParse(validRide())
    expect(result.success).toBe(true)
  })

  it("rejects when departure and arrival cities are the same", () => {
    const result = schema.safeParse(validRide({ arrivalCity: "Ankara" }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["arrivalCity"])
    }
  })

  it("rejects an unknown city", () => {
    const result = schema.safeParse(validRide({ departureCity: "Atlantis" }))
    expect(result.success).toBe(false)
  })

  it("rejects a missing departure date", () => {
    const result = schema.safeParse(validRide({ departureDate: "" }))
    expect(result.success).toBe(false)
  })

  it("rejects a missing departure time", () => {
    const result = schema.safeParse(validRide({ departureTime: "" }))
    expect(result.success).toBe(false)
  })

  it("rejects a departure time in the past", () => {
    const { departureDate, departureTime } = futureDateTimeParts(-24)
    const result = schema.safeParse(validRide({ departureDate, departureTime }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["departureTime"])
    }
  })

  it("accepts seat counts within bounds", () => {
    expect(schema.safeParse(validRide({ seatCount: MIN_SEAT_COUNT })).success).toBe(true)
    expect(schema.safeParse(validRide({ seatCount: MAX_SEAT_COUNT })).success).toBe(true)
  })

  it("rejects seat counts outside bounds", () => {
    expect(schema.safeParse(validRide({ seatCount: MIN_SEAT_COUNT - 1 })).success).toBe(false)
    expect(schema.safeParse(validRide({ seatCount: MAX_SEAT_COUNT + 1 })).success).toBe(false)
  })

  it("rejects a negative cost share", () => {
    expect(schema.safeParse(validRide({ costShare: -1 })).success).toBe(false)
  })

  it("accepts a zero cost share", () => {
    expect(schema.safeParse(validRide({ costShare: 0 })).success).toBe(true)
  })

  it("rejects a description longer than the max length", () => {
    const result = schema.safeParse(validRide({ description: "a".repeat(MAX_DESCRIPTION_LENGTH + 1) }))
    expect(result.success).toBe(false)
  })

  it("transforms an empty description to undefined", () => {
    const result = schema.safeParse(validRide({ description: "  " }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })

  it("accepts a district that belongs to its city", () => {
    const result = schema.safeParse(validRide({ departureDistrict: "Çankaya" }))
    expect(result.success).toBe(true)
  })

  it("rejects a district that doesn't belong to its city", () => {
    const result = schema.safeParse(validRide({ departureDistrict: "Kadıköy" }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["departureDistrict"])
    }
  })

  it("treats an empty district as no selection", () => {
    const result = schema.safeParse(validRide({ departureDistrict: "" }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.departureDistrict).toBeUndefined()
    }
  })
})
