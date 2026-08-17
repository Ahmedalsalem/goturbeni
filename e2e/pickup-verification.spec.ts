import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createAdminClient, createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the pickup verification code added in
// 0048_pickup_verification_code.sql (approve_booking now also generates a
// 4-digit booking_pickup_codes row; get_my_pickup_code / verify_pickup_code
// are its two RPCs), previously only unit-tested
// (src/features/pickup/actions.test.ts). booking_pickup_codes has no RLS
// select policy at all by design (see the migration's own comment) — reading
// the real code here goes through the service-role admin client, the same
// bypass pattern backdateRideDeparture already uses, rather than scraping it
// out of the passenger's rendered page.
async function getBookingId(rideId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.from("bookings").select("id").eq("ride_id", rideId).single()
  if (error) {
    throw error
  }
  return data.id as string
}

async function getPickupCode(bookingId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.from("booking_pickup_codes").select("code").eq("booking_id", bookingId).single()
  if (error) {
    throw error
  }
  return data.code as string
}

test.describe.serial("pickup verification code", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string
  let bookingId: string
  let realCode: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("pickupDriver")
    passengerEmail = uniqueEmail("pickupPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver creates a ride, passenger books, driver approves — a pickup code is generated", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Bodrum",
      arrivalCity: "Muğla",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 60,
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()

    bookingId = await getBookingId(rideId)
    realCode = await getPickupCode(bookingId)
    expect(realCode).toMatch(/^\d{4}$/)
  })

  test("passenger sees the real code on /bookings", async () => {
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Sürücüye bu kodu söyleyin")).toBeVisible()
    await expect(passengerPage.getByText(realCode, { exact: true })).toBeVisible()
  })

  test("driver rejects a wrong code, then accepts the real one", async () => {
    await driverPage.goto(`/rides/${rideId}/bookings`)
    const wrongCode = realCode === "0000" ? "1111" : "0000"

    await driverPage.getByLabel("Yolcu Kodu").fill(wrongCode)
    await driverPage.getByRole("button", { name: "Doğrula", exact: true }).click()
    await expect(driverPage.getByText("Kod yanlış. Lütfen yolcuya tekrar sorun.")).toBeVisible()

    await driverPage.getByLabel("Yolcu Kodu").fill(realCode)
    await driverPage.getByRole("button", { name: "Doğrula", exact: true }).click()
    await expect(driverPage.getByText("Yolcu kodu doğrulandı, yolculuk başladı.")).toBeVisible()

    // The input/button pair only renders while alreadyVerified is false
    // (VerifyPickupCodeForm) — its disappearance in favor of the "Yolcu
    // Alındı" badge confirms the server-side verified_at actually got set,
    // not just the toast firing.
    await expect(driverPage.getByRole("button", { name: "Doğrula", exact: true })).toHaveCount(0)
    await expect(driverPage.getByText("Yolcu Alındı")).toBeVisible()
  })

  test("passenger's badge switches from the code to a verified confirmation", async () => {
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Yolculuğunuz başladı")).toBeVisible()
    await expect(passengerPage.getByText(realCode, { exact: true })).toHaveCount(0)
  })
})
