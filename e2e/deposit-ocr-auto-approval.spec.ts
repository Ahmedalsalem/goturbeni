import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateAccountAge, createRide, realisticReceiptFilePayload, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the OCR-based deposit auto-approval added this session
// (submit_deposit_receipt_ocr, supabase/migrations/0053_deposit_ocr_auto_approval.sql):
// when the uploaded receipt's IBAN and amount match the ride's driver/cost
// share, the booking is approved automatically — the driver never has to
// click "İlk Yarı Ödemesini Aldım, Onayla". The driver's manual button stays
// as a fallback (still covered by booking-chat-review.spec.ts and
// payment-review.spec.ts, both of which upload a blank receipt that OCR
// can't match, and confirm the manual flow is untouched).
test.describe.serial("deposit receipt OCR auto-approval", () => {
  const driverEmail = uniqueEmail("ocrDriver")
  const passengerEmail = uniqueEmail("ocrPassenger")

  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver and passenger sign up, driver creates a ride", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
    // The auto-approval risk gate requires a ≥14-day-old account — a fresh
    // e2e signup never qualifies otherwise.
    await backdateAccountAge(passengerEmail, 30)

    // createRide always sets the driver's IBAN to this exact value — the
    // receipt below must match it for auto-approval to trigger.
    rideId = await createRide(driverPage, {
      departureCity: "Ankara",
      arrivalCity: "İstanbul",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 200,
    })
    expect(rideId).toBeTruthy()
  })

  test("passenger books the ride and uploads a receipt matching the driver's IBAN/amount", async () => {
    // First visit to /rides/[id] in this file — Turbopack compiles routes on
    // demand, so this can take longer than the default 5s assertion timeout
    // on a cold run (same class of issue as playwright.config.ts's other
    // cold-compile notes).
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible({ timeout: 30_000 })

    // Deposit = cost_share (200) * seat_count (1, the booking default) * 0.5.
    const receipt = await realisticReceiptFilePayload(passengerPage, "deposit.png", "TR33 0006 1005 1978 6457 8413 26", 100)
    await passengerPage.locator('input[type="file"]').setInputFiles(receipt)
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()
  })

  test("the booking is auto-approved without the driver clicking anything", async () => {
    // The OCR check runs in the background (next/server's after(), see
    // submitDepositReceipt) after the upload response already returned, so
    // this polls rather than expecting it to have finished immediately.
    await expect
      .poll(
        async () => {
          await driverPage.goto(`/rides/${rideId}/bookings`)
          return driverPage.getByText("Onaylandı").isVisible()
        },
        { timeout: 20_000, intervals: [1_000, 2_000, 3_000] }
      )
      .toBe(true)

    // The driver never saw/clicked "İlk Yarı Ödemesini Aldım, Onayla" — if
    // it's still on the page, auto-approval didn't actually happen and some
    // other booking/state is showing "Onaylandı" instead.
    await expect(driverPage.getByRole("button", { name: "İlk Yarı Ödemesini Aldım, Onayla", exact: true })).not.toBeVisible()
  })
})
