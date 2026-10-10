import { expect, test } from "@playwright/test"

import { selectCombobox, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the cost-share estimate hint added to RideForm
// (src/utils/cost-estimate.ts + RideForm.tsx) — a first-time poster has no
// idea what to charge, so once departure/arrival city and seat count are
// filled in, a rough suggestion appears with a button to fill the field.
// 405 for Ankara->İstanbul is computed from the real estimateCostSharePerSeat
// function, not hand-picked; it no longer depends on the seat count.
test("ride form suggests a cost share once the route is picked, and can fill it in", async ({ page }) => {
  const email = uniqueEmail("costEstimate")
  await signUpAndVerify(page, email)

  await page.goto("/create-ride")
  await selectCombobox(page, "departureCity", "Ankara")
  await selectCombobox(page, "arrivalCity", "İstanbul")
  // The estimate hint only renders when !freeRide (RideForm.tsx) — "Ücretsiz
  // yolculuk" defaults to checked on create, so it must be unchecked first.
  await page.locator('[aria-labelledby="freeRide-label"]').click()

  await expect(page.getByText("Tahmini kişi başı maliyet: ~405 ₺")).toBeVisible()
  await page.locator("#seatCount").fill("3")
  await expect(page.getByText("Tahmini kişi başı maliyet: ~405 ₺")).toBeVisible()

  await page.getByRole("button", { name: "Bu tutarı kullan", exact: true }).click()
  await expect(page.locator("#costShare")).toHaveValue("405")
})
