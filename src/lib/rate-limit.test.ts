import { describe, expect, it } from "vitest"

import { checkRateLimit } from "@/lib/rate-limit"

describe("checkRateLimit", () => {
  it("allows the first call within a fresh window", () => {
    expect(checkRateLimit("user:1", 3, 1000, 0)).toBe(true)
  })

  it("rejects calls beyond the limit within the same window", () => {
    const key = "user:2"
    const limit = 3
    const windowMs = 1000
    const now = 0

    expect(checkRateLimit(key, limit, windowMs, now)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs, now + 100)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs, now + 200)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs, now + 300)).toBe(false)
    expect(checkRateLimit(key, limit, windowMs, now + 400)).toBe(false)
  })

  it("resets the counter once resetAt has passed", () => {
    const key = "user:3"
    const limit = 1
    const windowMs = 1000
    const now = 0

    expect(checkRateLimit(key, limit, windowMs, now)).toBe(true)
    expect(checkRateLimit(key, limit, windowMs, now + 500)).toBe(false)
    // now + 1000 === resetAt, and the bucket check is `resetAt <= now`, so the
    // window is considered expired exactly at resetAt.
    expect(checkRateLimit(key, limit, windowMs, now + 1000)).toBe(true)
  })

  it("does not let different keys interact", () => {
    const limit = 1
    const windowMs = 1000
    const now = 0

    expect(checkRateLimit("keyA", limit, windowMs, now)).toBe(true)
    expect(checkRateLimit("keyB", limit, windowMs, now)).toBe(true)
    // keyA is now exhausted for this window, keyB is unaffected either way.
    expect(checkRateLimit("keyA", limit, windowMs, now + 100)).toBe(false)
    expect(checkRateLimit("keyB", limit, windowMs, now + 100)).toBe(false)
  })
})
