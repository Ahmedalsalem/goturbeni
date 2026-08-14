import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the has_ac search filter (0066_profile_has_ac.sql,
// resolveHasAcRideIds in src/features/rides/queries.ts): a ride whose
// driver has has_ac=false must not appear when the filter is active, and
// must appear when it's off.
test.describe.serial("air conditioning filter", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let driverContext: BrowserContext
  let driverPage: Page

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("acDriver")
    driverContext = await browser.newContext()
    driverPage = await driverContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
  })

  test("driver without AC creates a ride; ride is hidden when the AC filter is on, visible when off", async () => {
    await signUpAndVerify(driverPage, driverEmail)

    const rideId = await createRide(driverPage, {
      departureCity: "Trabzon",
      arrivalCity: "Rize",
      minutesAhead: 40,
      seatCount: 2,
      costShare: 60,
    })
    expect(rideId).toBeTruthy()

    // Confirm the driver's own profile really has has_ac unchecked by
    // default (no explicit opt-in during signUpAndVerify/createRide).
    await driverPage.goto("/rides")
    await driverPage.locator('[aria-labelledby="filter-has-ac-label"]').click()
    await driverPage.getByRole("button", { name: "Ara", exact: true }).click()
    await expect(driverPage.getByText("Trabzon")).not.toBeVisible()

    await driverPage.goto("/rides")
    await expect(driverPage.getByText("Trabzon")).toBeVisible()
  })
})
