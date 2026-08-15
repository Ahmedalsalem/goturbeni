import { describe, expect, it } from "vitest"

import { getExperienceLevel } from "./experienceLevel"

describe("getExperienceLevel", () => {
  it("returns 'new' for 0 completed rides", () => {
    expect(getExperienceLevel(0)).toBe("new")
  })

  it("returns 'active' for 1 to 4 completed rides", () => {
    expect(getExperienceLevel(1)).toBe("active")
    expect(getExperienceLevel(4)).toBe("active")
  })

  it("returns 'experienced' for 5 to 14 completed rides", () => {
    expect(getExperienceLevel(5)).toBe("experienced")
    expect(getExperienceLevel(14)).toBe("experienced")
  })

  it("returns 'ambassador' for 15 or more completed rides", () => {
    expect(getExperienceLevel(15)).toBe("ambassador")
    expect(getExperienceLevel(1000)).toBe("ambassador")
  })
})
