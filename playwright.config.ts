import { defineConfig, devices } from "@playwright/test"

// Runs against a local Supabase instance started with `npx supabase start`
// (see supabase/config.toml) — never against the real linked project. The
// dev server is used rather than a production build: it boots faster and is
// the same server that was used for prior manual Playwright verification of
// these flows (see PROJECT_STATUS.md), so it's a known-good target.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // The chat test (booking-chat-review.spec.ts) has no optimistic append —
  // the sender only sees their own message once the Realtime postgres_changes
  // INSERT event round-trips back (see comment there) — so it's inherently
  // sensitive to websocket delivery latency. It ran reliably at retries: 0
  // for a long time, but started intermittently missing that 15s window
  // once the suite grew another spec file (more accounts/requests ahead of
  // it in the same single-worker run, more load on the same local Supabase
  // Realtime container by the time it runs). One retry absorbs that without
  // masking a real regression — a genuinely broken chat flow still fails
  // twice in a row.
  retries: process.env.CI ? 1 : 0,
  // Headroom for cold Turbopack compiles on each route's first visit across
  // the suite (webServer's readiness check only confirms "/" responds, not
  // that e.g. /create-ride, /rides/mine, or /login have compiled yet —
  // Next.js dev compiles routes on-demand per request). 90s still wasn't
  // enough — /register, /create-ride, and /login each independently
  // exceeded it on first visit on this CI runner (each a distinct instance
  // of the same root cause, not three different bugs). Separate concern
  // from the real stuck-forever bugs that were also timing out here before
  // (missing termsAccepted checkbox click, missing driver IBAN, exhausted
  // signup rate limit — all fixed, see e2e/utils.ts and git log) — no
  // timeout value fixes those; this is purely a compile-time budget.
  timeout: 180_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // See SIGNUP_RATE_LIMIT in src/features/auth/actions.ts — the 3 spec
    // files together create more accounts per run than the real signup cap
    // allows, since they all share one in-memory bucket in this environment.
    env: { E2E_TEST: "true" },
  },
})
