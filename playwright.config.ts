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
  // Default (30s) wasn't enough for the very first navigation in the suite
  // (webServer's readiness check only confirms "/" responds — Next.js dev
  // still compiles each route on-demand on its first request, and /register
  // took long enough on a loaded CI runner to exceed it: "Test timeout of
  // 30000ms exceeded" waiting for the post-signup redirect). Same class of
  // fix as the 30-minute departure-time buffer elsewhere in e2e/ — a real CI
  // timing constraint, not a test logic bug.
  timeout: 60_000,
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
