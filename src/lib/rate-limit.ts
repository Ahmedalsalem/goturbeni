import "server-only"

import { headers } from "next/headers"

type Bucket = { count: number; resetAt: number }

// Fixed-window limiter held in process memory. Resets on redeploy and does
// NOT share state across multiple serverless instances — acceptable as a
// best-effort abuse guard for this app's current single-instance-friendly
// deployment. Swap for a Redis-backed limiter (e.g. Upstash) before running
// on multi-instance serverless.
const buckets = new Map<string, Bucket>()

const SWEEP_THRESHOLD = 10_000

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
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
