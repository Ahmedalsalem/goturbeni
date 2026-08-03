import { expect, test } from "@playwright/test"

import { selectCombobox, signUpAndVerify, nearFutureIstanbulDateTime, uniqueEmail } from "./utils"

// Coverage for the batch of guest-facing/i18n changes that only had manual
// (Playwright-script, not committed) verification during the session that
// added them: mobile header CTA, welcome modal, expanded support page,
// English locale, and the new car-plate-required-to-post-a-ride guard.

test("guest sees the welcome modal on first visit only", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("GötürBeni'ye hoş geldin")).toBeVisible()
  await page.getByText("Şimdi değil").click()
  await expect(page.getByText("GötürBeni'ye hoş geldin")).not.toBeVisible()

  await page.reload()
  await expect(page.getByText("GötürBeni'ye hoş geldin")).not.toBeVisible()
})

test("mobile guest sees Giriş Yap in the header, not just a menu icon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  // Dismiss the welcome modal so it doesn't intercept the header click target.
  await page.getByText("Şimdi değil").click()
  await expect(page.locator("header a", { hasText: "Giriş Yap" })).toBeVisible()
  await expect(page.locator("header button[aria-label='Menü']")).toBeVisible()
})

test("support page shows the contact card and categorized FAQ", async ({ page }) => {
  await page.goto("/support")
  await expect(page.getByText("Bize Ulaş")).toBeVisible()
  await expect(page.locator("a[href^='mailto:novarodigitalstudio@gmail.com']")).toBeVisible()
  await expect(page.getByText("Rezervasyon & Ödeme")).toBeVisible()
  await expect(page.getByText("Neden araç plakası istiyorsunuz?")).toBeVisible()
})

test("switching to English persists across navigation", async ({ page }) => {
  await page.goto("/")
  await page.getByText("Şimdi değil").click()
  await page.locator("header button[aria-label='Dil']").click()
  await page.getByRole("menuitem", { name: "English" }).click()

  // Wait for the locale switch to actually take effect (the header's own nav
  // link re-rendering in English) instead of `waitForLoadState("networkidle")`
  // — that idle heuristic is unreliable here because Next dev's HMR
  // websocket keeps a connection open, so it doesn't reliably signal that the
  // setUserLocale server action + router.refresh() have landed. This was the
  // actual cause of CI-only flakiness (passed locally every time, failed
  // consistently in CI where the extra websocket-notify latency mattered).
  await expect(page.locator("header").getByText("How It Works")).toBeVisible()

  // First (and only) visit to /how-it-works in the whole suite — Turbopack
  // compiles routes on demand, so this request can take much longer than the
  // default 5s assertion timeout on a cold CI runner (see playwright.config.ts
  // for the same cold-compile issue on other routes).
  await page.goto("/how-it-works")
  await expect(page.getByRole("heading", { name: "How It Works" })).toBeVisible({ timeout: 30_000 })
})

// Regression for the new guard in features/rides/actions.ts createRide():
// a driver without a valid plate on file must be blocked with a clear error,
// not a generic failure or a silent insert.
test("posting a ride without a valid car plate on file is rejected", async ({ page }) => {
  const email = uniqueEmail("noplate")
  await signUpAndVerify(page, email)

  await page.goto("/profile")
  await page.locator("#fullName").fill("E2E Plakasız Sürücü")
  await page.locator("#iban").fill("TR330006100519786457841326")
  await page.locator("#ibanHolderName").fill("E2E Plakasız Sürücü")
  await page.getByRole("button", { name: "Kaydet" }).click()
  await page.getByText("Profil güncellendi.").waitFor()

  await page.goto("/create-ride")
  await selectCombobox(page, "departureCity", "İzmir")
  await selectCombobox(page, "arrivalCity", "Antalya")
  const { date, time } = nearFutureIstanbulDateTime(30)
  await page.locator("#departureDate").fill(date)
  await page.locator("#departureTime").fill(time)
  await page.locator("#seatCount").fill("2")
  await page.locator("#costShare").fill("50")
  await page.getByRole("button", { name: "İlanı Yayınla" }).click()

  await expect(page.getByText("İlan verebilmek için önce profilinize geçerli bir araç plakası ekleyin.")).toBeVisible()
  await expect(page).toHaveURL(/\/create-ride$/)
})
