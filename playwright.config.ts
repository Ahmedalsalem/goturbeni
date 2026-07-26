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
  retries: 0,
  // Slightly above the 30s default as headroom for cold Turbopack compiles
  // on the very first navigation in the suite (webServer's readiness check
  // only confirms "/" responds, not that e.g. /register has compiled yet).
  // Not a fix for the real bug that was timing out here (signUp() never
  // checked the required termsAccepted checkbox, see e2e/utils.ts) — that
  // was a permanently-stuck submit, not a slow one, no timeout would have
  // "fixed" it.
  timeout: 45_000,
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
  },
})
