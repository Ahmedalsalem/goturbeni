import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for create_booking's auto-approve branch (0065_instant_booking.sql):
// when a ride has instant_booking=true and seats are available, a passenger's
// booking request skips 'pending' entirely and lands as 'approved' — no
// driver action needed. Also proves the manual approve/reject UI genuinely
// never appears for this booking (BookingActions is only rendered for
// status='pending' rows, see rides/[id]/bookings/page.tsx).
test.describe.serial("instant booking", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("instantDriver")
    passengerEmail = uniqueEmail("instantPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver creates an instant-booking ride, passenger's request is auto-approved", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Bursa",
      arrivalCity: "İzmir",
      minutesAhead: 45,
      seatCount: 3,
      costShare: 120,
      instantBooking: true,
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyonunuz anında onaylandı.")).toBeVisible({ timeout: 30_000 })

    // Reload and confirm the durable, DB-backed state: approved badge, no
    // pending cancel-only state.
    await passengerPage.reload()
    await expect(passengerPage.getByText("Onaylandı")).toBeVisible()

    // The driver never sees an approve/reject prompt for this booking — it
    // was never 'pending'.
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByRole("button", { name: "Onayla", exact: true })).toHaveCount(0)
    await expect(driverPage.getByText("Onaylandı")).toBeVisible()
  })
})
