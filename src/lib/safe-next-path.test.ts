import { describe, expect, it } from "vitest"

import { safeNextPath } from "./safe-next-path"

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password")
    expect(safeNextPath("/rides/abc?x=1")).toBe("/rides/abc?x=1")
  })

  it.each([null, "", ".evil.com", "@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "evil.com"])(
    "falls back to /profile for %s",
    (next) => {
      expect(safeNextPath(next)).toBe("/profile")
    }
  )
})
