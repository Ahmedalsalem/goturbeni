// Scenario 1: concurrent read-only browsing — N virtual users hit `/` and
// `/rides` (with and without filters) at once against the local `npm run
// dev` server. Requires the app to already be running (see README).
//
// Usage: node loadtest/browse-load.mjs [vus] [requestsPerVU]
import { APP_URL } from "./lib/config.mjs"

const VUS = Number(process.argv[2] || process.env.LOAD_TEST_VUS || 75)
const REQUESTS_PER_VU = Number(process.argv[3] || process.env.LOAD_TEST_REQUESTS_PER_VU || 6)

const PROVINCE_PAIRS = [
  ["İstanbul", "Ankara"],
  ["İzmir", "Antalya"],
  ["Bursa", "Eskişehir"],
  ["Adana", "Mersin"],
  ["Konya", "İstanbul"],
]

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function searchUrl() {
  const [from, to] = randomOf(PROVINCE_PAIRS)
  const sort = randomOf(["date_asc", "date_desc", "cost_asc", "cost_desc"])
  return `${APP_URL}/rides?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sort=${sort}`
}

async function timedGet(url) {
  const start = performance.now()
  try {
    const res = await fetch(url)
    // Drain the body — otherwise Node may not fully account for transfer time.
    await res.text()
    return { ok: res.ok, status: res.status, ms: performance.now() - start }
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - start, error: String(err) }
  }
}

async function virtualUser() {
  const results = []
  for (let i = 0; i < REQUESTS_PER_VU; i++) {
    const url = i % 3 === 0 ? `${APP_URL}/` : i % 3 === 1 ? `${APP_URL}/rides` : searchUrl()
    results.push(await timedGet(url))
    // Small jitter so all VUs don't hammer in perfect lockstep — closer to
    // real, staggered page loads than a synchronized burst.
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 150))
  }
  return results
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function main() {
  console.log(`Browsing load: ${VUS} concurrent virtual users, ${REQUESTS_PER_VU} requests each, target ${APP_URL}`)
  const start = performance.now()
  const perUser = await Promise.all(Array.from({ length: VUS }, (_, i) => virtualUser(i)))
  const wallMs = performance.now() - start
  const all = perUser.flat()

  const okCount = all.filter((r) => r.ok).length
  const failed = all.filter((r) => !r.ok)
  const latencies = all.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b)

  console.log(`\nTotal requests: ${all.length}, success: ${okCount}, failed: ${failed.length}, wall time: ${(wallMs / 1000).toFixed(1)}s`)
  console.log(`Latency (successful requests, ms): p50=${percentile(latencies, 50).toFixed(0)} p95=${percentile(latencies, 95).toFixed(0)} p99=${percentile(latencies, 99).toFixed(0)} max=${(latencies.at(-1) || 0).toFixed(0)}`)
  console.log(`Throughput: ${(all.length / (wallMs / 1000)).toFixed(1)} req/s`)

  if (failed.length > 0) {
    const byStatus = failed.reduce((acc, r) => {
      const key = r.error ? "network_error" : r.status
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    console.log("Failure breakdown:", byStatus)
    process.exitCode = 1
  }
}

main()
