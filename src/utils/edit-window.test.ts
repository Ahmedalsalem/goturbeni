import { describe, expect, it } from "vitest"

import { EDIT_WINDOW_MS, isWithinEditWindow } from "@/utils/edit-window"

describe("isWithinEditWindow", () => {
  it("returns true for a timestamp just created", () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    expect(isWithinEditWindow(now.toISOString(), now)).toBe(true)
  })

  it("returns true for a timestamp just inside the window", () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    const createdAt = new Date(now.getTime() - EDIT_WINDOW_MS + 1000).toISOString()
    expect(isWithinEditWindow(createdAt, now)).toBe(true)
  })

  it("returns false for a timestamp exactly at the window boundary", () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    const createdAt = new Date(now.getTime() - EDIT_WINDOW_MS).toISOString()
    expect(isWithinEditWindow(createdAt, now)).toBe(false)
  })

  it("returns false for a timestamp well outside the window", () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    const createdAt = new Date(now.getTime() - EDIT_WINDOW_MS - 60_000).toISOString()
    expect(isWithinEditWindow(createdAt, now)).toBe(false)
  })
})
