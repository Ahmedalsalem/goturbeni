import "server-only"

import { headers } from "next/headers"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

type Bucket = { count: number; resetAt: number }

// Fixed-window limiter held in process memory. Resets on redeploy and does
// NOT share state across multiple serverless instances — used only outside
// production (see redis/assertion below), where requiring every contributor
// to run a real Upstash database for local dev/test would be unreasonable.
const buckets = new Map<string, Bucket>()

const SWEEP_THRESHOLD = 10_000

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

function checkInMemory(key: string, limit: number, windowMs: number, now: number): boolean {
  if (buckets.size > SWEEP_THRESHOLD) {
    sweepExpired(now)
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1
  return true
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null

// One Ratelimit instance per distinct (limit, windowMs) pair used by a
// caller — Upstash's guidance is to reuse instances rather than construct
// one per request.
const limiters = new Map<string, Ratelimit>()

function getLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`
  let limiter = limiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({ redis: redis!, limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`) })
    limiters.set(cacheKey, limiter)
  }
  return limiter
}

export async function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): Promise<boolean> {
  if (!redis) {
    // Multi-instance serverless production must share rate-limit state
    // across instances, which the in-memory map above cannot do — fail on
    // first use rather than silently degrade to a per-instance limiter
    // that no longer protects anything. Checked lazily (not at module
    // load) so a missing var doesn't break `next build`'s page-data
    // collection, which evaluates this module under NODE_ENV=production.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production — " +
          "see .env.example for where to get them from the Upstash console."
      )
    }
    return checkInMemory(key, limit, windowMs, now)
  }
  const { success } = await getLimiter(limit, windowMs).limit(key)
  return success
}

// Best-effort client identifier for pre-auth actions (login, signup, password
// reset) where there's no user id yet to key the limiter on.
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers()
  const forwardedFor = requestHeaders.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim()
  }
  return requestHeaders.get("x-real-ip") ?? "unknown"
}
