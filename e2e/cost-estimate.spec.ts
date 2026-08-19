import { expect, test } from "@playwright/test"

import { selectCombobox, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the cost-share estimate hint added to RideForm
// (src/utils/cost-estimate.ts + RideForm.tsx) — a first-time poster has no
// idea what to charge, so once departure/arrival city and seat count are
// filled in, a rough suggestion appears with a button to fill the field.
// 610 for Ankara->İstanbul at the default seatCount (MIN_SEAT_COUNT=1) is
// computed from the real estimateCostSharePerSeat function, not hand-picked.
test("ride form suggests a cost share once the route is picked, and can fill it in", async ({ page }) => {
  const email = uniqueEmail("costEstimate")
  await signUpAndVerify(page, email)

  await page.goto("/create-ride")
  await selectCombobox(page, "departureCity", "Ankara")
  await selectCombobox(page, "arrivalCity", "İstanbul")

  await expect(page.getByText("Tahmini maliyet: ~610 ₺")).toBeVisible()

  await page.getByRole("button", { name: "Bu tutarı kullan", exact: true }).click()
  await expect(page.locator("#costShare")).toHaveValue("610")
})
