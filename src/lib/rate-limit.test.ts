import { afterEach, describe, expect, it, vi } from "vitest"

import { checkRateLimit } from "@/lib/rate-limit"

describe("checkRateLimit", () => {
  it("allows the first call within a fresh window", async () => {
    expect(await checkRateLimit("user:1", 3, 1000, 0)).toBe(true)
  })

  it("rejects calls beyond the limit within the same window", async () => {
    const key = "user:2"
    const limit = 3
    const windowMs = 1000
    const now = 0

    expect(await checkRateLimit(key, limit, windowMs, now)).toBe(true)
    expect(await checkRateLimit(key, limit, windowMs, now + 100)).toBe(true)
    expect(await checkRateLimit(key, limit, windowMs, now + 200)).toBe(true)
    expect(await checkRateLimit(key, limit, windowMs, now + 300)).toBe(false)
    expect(await checkRateLimit(key, limit, windowMs, now + 400)).toBe(false)
  })

  it("resets the counter once resetAt has passed", async () => {
    const key = "user:3"
    const limit = 1
    const windowMs = 1000
    const now = 0

    expect(await checkRateLimit(key, limit, windowMs, now)).toBe(true)
    expect(await checkRateLimit(key, limit, windowMs, now + 500)).toBe(false)
    // now + 1000 === resetAt, and the bucket check is `resetAt <= now`, so the
    // window is considered expired exactly at resetAt.
    expect(await checkRateLimit(key, limit, windowMs, now + 1000)).toBe(true)
  })

  it("does not let different keys interact", async () => {
    const limit = 1
    const windowMs = 1000
    const now = 0

    expect(await checkRateLimit("keyA", limit, windowMs, now)).toBe(true)
    expect(await checkRateLimit("keyB", limit, windowMs, now)).toBe(true)
    // keyA is now exhausted for this window, keyB is unaffected either way.
    expect(await checkRateLimit("keyA", limit, windowMs, now + 100)).toBe(false)
    expect(await checkRateLimit("keyB", limit, windowMs, now + 100)).toBe(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("throws in production when Upstash env vars are unset instead of silently using the in-memory limiter", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await expect(checkRateLimit("prod-key", 1, 1000, 0)).rejects.toThrow(/UPSTASH_REDIS_REST_URL/)
  })
})
