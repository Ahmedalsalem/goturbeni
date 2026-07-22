import { describe, expect, it } from "vitest"

import { buildBookingSchema, MIN_BOOKING_SEAT_COUNT } from "@/features/bookings/schemas"

const t = ((key: string) => key) as Parameters<typeof buildBookingSchema>[0]

describe("buildBookingSchema", () => {
  const schema = buildBookingSchema(t)

  it("accepts a seat count at the minimum bound", () => {
    expect(schema.safeParse({ seatCount: MIN_BOOKING_SEAT_COUNT }).success).toBe(true)
  })

  it("accepts a seat count above the minimum", () => {
    expect(schema.safeParse({ seatCount: 4 }).success).toBe(true)
  })

  it("rejects a seat count below the minimum", () => {
    expect(schema.safeParse({ seatCount: MIN_BOOKING_SEAT_COUNT - 1 }).success).toBe(false)
  })

  it("rejects a non-integer seat count", () => {
    expect(schema.safeParse({ seatCount: 1.5 }).success).toBe(false)
  })

  it("coerces a numeric string seat count", () => {
    const result = schema.safeParse({ seatCount: "2" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.seatCount).toBe(2)
    }
  })
})
