import { describe, expect, it } from "vitest"

import { getWeekdayLabel } from "@/utils/weekday"

describe("getWeekdayLabel", () => {
  it("maps Postgres extract(dow) convention (0=Sunday..6=Saturday) to Turkish weekday names", () => {
    expect(getWeekdayLabel(0, "tr")).toBe("Pazar")
    expect(getWeekdayLabel(1, "tr")).toBe("Pazartesi")
    expect(getWeekdayLabel(6, "tr")).toBe("Cumartesi")
  })
})
