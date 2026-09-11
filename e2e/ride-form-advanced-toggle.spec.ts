import { expect, test } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// RideForm.tsx collapses pets/smoking/payment/instantBooking/car-features/
// repeatWeekly behind a "Diğer ayarlar" toggle so a first-time poster only
// faces the fields that actually block publishing. Guards against that
// collapse regressing to always-visible (defeats the point) or the toggled
// content losing its bound react-hook-form values (fields use a `hidden`
// class, not unmounting, specifically to avoid this).
test.describe("ride form advanced-options toggle", () => {
  test("driver mode: advanced fields are hidden until toggled, in both directions", async ({ page }) => {
    await signUpAndVerify(page, uniqueEmail("advtoggle"))

    await page.goto("/create-ride")
    const petsCheckbox = page.locator('[aria-labelledby="petsAllowed-label"]')
    await expect(petsCheckbox).toBeHidden()

    await page.getByRole("button", { name: "Diğer ayarlar" }).click()
    await expect(petsCheckbox).toBeVisible()
    await expect(page.getByText("Büyük bagaj alabilir")).toBeVisible()

    await page.getByRole("button", { name: "Daha az göster" }).click()
    await expect(petsCheckbox).toBeHidden()
  })

  test("passenger mode: pets/smoking/luggage/etc. show passenger-phrased labels, no payment/repeat", async ({ page }) => {
    await signUpAndVerify(page, uniqueEmail("advtogglepass"))

    await page.goto("/create-ride")
    await page.getByRole("button", { name: "Yolcuyum", exact: true }).click()
    await page.getByRole("button", { name: "Diğer ayarlar" }).click()

    await expect(page.getByText("Evcil hayvanım var")).toBeVisible()
    await expect(page.getByText("Sigara içiyorum")).toBeVisible()
    await expect(page.getByText("Büyük bagajım var")).toBeVisible()
    await expect(page.locator('[aria-labelledby="paymentMethodBankTransfer-label"]')).toHaveCount(0)
    await expect(page.locator('[aria-labelledby="repeatWeekly-label"]')).toHaveCount(0)
  })

  test("edit mode: advanced section starts expanded, existing checked values still show", async ({ page }) => {
    const email = uniqueEmail("advtoggleedit")
    await signUpAndVerify(page, email)

    const rideId = await createRide(page, {
      departureCity: "İstanbul",
      arrivalCity: "Ankara",
      minutesAhead: 180,
      seatCount: 2,
      costShare: 500,
      petsAllowed: true,
    })

    await page.goto(`/rides/${rideId}/edit`)
    await expect(page.getByRole("button", { name: "Daha az göster" })).toBeVisible()
    await expect(page.locator('[aria-labelledby="petsAllowed-label"]')).toHaveAttribute("aria-checked", "true")
  })
})
