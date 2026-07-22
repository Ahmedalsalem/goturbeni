import { describe, expect, it } from "vitest"

import { parseIstanbulDateTime, toIstanbulDateInputValue, toIstanbulTimeInputValue } from "@/utils/istanbul-time"

describe("parseIstanbulDateTime", () => {
  it("interprets the wall-clock time as Europe/Istanbul (UTC+3), not the runtime's local timezone", () => {
    const result = parseIstanbulDateTime("2026-07-23", "14:30")
    // 14:30 Istanbul (UTC+3) = 11:30 UTC.
    expect(result.toISOString()).toBe("2026-07-23T11:30:00.000Z")
  })

  it("produces the same instant regardless of what the test runner's own timezone is", () => {
    // This would only fail if something regressed to using the bare `Date`
    // constructor (whose interpretation depends on process.env.TZ).
    const result = parseIstanbulDateTime("2026-01-01", "00:00")
    expect(result.toISOString()).toBe("2025-12-31T21:00:00.000Z")
  })
})

describe("toIstanbulDateInputValue / toIstanbulTimeInputValue", () => {
  it("round-trips a parsed Istanbul date/time back to the original input values", () => {
    const iso = parseIstanbulDateTime("2026-07-23", "14:30").toISOString()
    expect(toIstanbulDateInputValue(iso)).toBe("2026-07-23")
    expect(toIstanbulTimeInputValue(iso)).toBe("14:30")
  })

  it("converts a UTC timestamp to Istanbul wall-clock time, not the literal UTC values", () => {
    // 23:30 UTC on the 22nd is 02:30 Istanbul on the 23rd — this must not
    // just slice the UTC ISO string.
    const iso = "2026-07-22T23:30:00.000Z"
    expect(toIstanbulDateInputValue(iso)).toBe("2026-07-23")
    expect(toIstanbulTimeInputValue(iso)).toBe("02:30")
  })
})
