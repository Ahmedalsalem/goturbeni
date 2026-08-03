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
  // Deliberately 0 globally, even in CI: several specs are test.describe.serial
  // journeys that create persistent rows (rides, bookings) with no unique
  // constraint on repeated runs (e.g. same departure/arrival city pair) — a
  // whole-group retry re-creates that data and produces duplicates that break
  // later strict-mode locators in the *same* file (learned this the hard way,
  // see git history). Flake mitigation belongs per-file via
  // test.describe.configure({ retries }), scoped to the one spec that
  // actually needs it (booking-chat-review.spec.ts), not here.
  retries: 0,
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
