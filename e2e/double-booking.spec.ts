import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Regression for the last-seat protection in approve_booking() (see
// supabase/migrations/0003_bookings.sql): two passengers both request the
// single seat on a ride, the driver approves one, and approving the second
// must be rejected by the RPC's `available_seats < seat_count` check rather
// than silently over-booking the ride. A genuinely concurrent double-click
// race would be flakier to assert on than this deterministic sequential
// over-approval attempt, which exercises the same guard.
test.describe.serial("double-booking protection", () => {
  const driverEmail = uniqueEmail("driver2")
  const passengerAEmail = uniqueEmail("passengerA")
  const passengerBEmail = uniqueEmail("passengerB")

  let driverContext: BrowserContext
  let passengerAContext: BrowserContext
  let passengerBContext: BrowserContext
  let driverPage: Page
  let passengerAPage: Page
  let passengerBPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverContext = await browser.newContext()
    passengerAContext = await browser.newContext()
    passengerBContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerAPage = await passengerAContext.newPage()
    passengerBPage = await passengerBContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerAContext.close()
    await passengerBContext.close()
  })

  test("driver creates a one-seat ride and both passengers request it", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerAPage, passengerAEmail)
    await signUpAndVerify(passengerBPage, passengerBEmail)

    rideId = await createRide(driverPage, {
      departureCity: "İzmir",
      arrivalCity: "Antalya",
      minutesAhead: 30,
      seatCount: 1,
      costShare: 50,
    })

    await passengerAPage.goto(`/rides/${rideId}`)
    await passengerAPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerAPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await passengerBPage.goto(`/rides/${rideId}`)
    await passengerBPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerBPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()
  })

  test("approving the second booking for the last seat is rejected", async () => {
    await driverPage.goto(`/rides/${rideId}/bookings`)
    const approveLabel = "Kaporayı Aldım, Onayla"
    const confirmApproveLabel = "Kaporayı aldığınızı onaylıyor musunuz?"

    await expect(driverPage.getByRole("button", { name: approveLabel, exact: true })).toHaveCount(2)

    await driverPage.getByRole("button", { name: approveLabel, exact: true }).first().click()
    await driverPage.getByRole("button", { name: confirmApproveLabel, exact: true }).first().click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()

    // Only the still-pending booking has an approve button left now.
    await expect(driverPage.getByRole("button", { name: approveLabel, exact: true })).toHaveCount(1)

    await driverPage.getByRole("button", { name: approveLabel, exact: true }).click()
    await driverPage.getByRole("button", { name: confirmApproveLabel, exact: true }).click()
    await expect(driverPage.getByText("Yeterli boş koltuk yok.")).toBeVisible()

    // Rejected by the RPC, not silently accepted — the booking is still
    // pending (still shows the plain approve action, not an "Onaylandı" badge).
    await expect(driverPage.getByRole("button", { name: approveLabel, exact: true })).toHaveCount(1)
  })
})
