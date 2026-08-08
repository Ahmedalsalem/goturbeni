import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import {
  backdateAccountAge,
  backdateRideDeparture,
  createRide,
  realisticReceiptFilePayload,
  signUpAndVerify,
  uniqueEmail,
} from "./utils"

// Coverage for the OCR-based deposit/settlement auto-approval added this
// session (submit_deposit_receipt_ocr/submit_settlement_receipt_ocr,
// 0053/0054_*_ocr_auto_approval.sql): when an uploaded receipt's IBAN and
// amount match the ride's driver/cost share, the booking (deposit) or
// payment (settlement) is approved automatically — neither side has to click
// a manual confirm button. Those manual buttons stay as a fallback (still
// covered by booking-chat-review.spec.ts and payment-review.spec.ts, both of
// which upload a blank receipt that OCR can't match, confirming the manual
// flow is untouched).
test.describe.serial("deposit/settlement receipt OCR auto-approval", () => {
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

    // Deposit = cost_share (200) * seat_count (1, the booking default) * 0.25.
    const receipt = await realisticReceiptFilePayload(passengerPage, "deposit.png", "TR33 0006 1005 1978 6457 8413 26", 50)
    await passengerPage.locator('input[type="file"]').setInputFiles(receipt)
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()
  })

  test("the booking is auto-approved without the driver clicking anything", async () => {
    // The OCR check runs in the background (next/server's after(), see
    // submitDepositReceipt) after the upload response already returned, so
    // this polls rather than expecting it to have finished immediately.
    // Tesseract's worker_thread + WASM spin-up has genuine cold-start
    // variance (usually ~1-3s, occasionally much longer under load) —
    // observed timing out at 20s and then completing in 3s on an immediate
    // re-run, so this window is intentionally generous rather than tight.
    await expect
      .poll(
        async () => {
          await driverPage.goto(`/rides/${rideId}/bookings`)
          return driverPage.getByText("Onaylandı").isVisible()
        },
        { timeout: 45_000, intervals: [1_000, 2_000, 3_000, 5_000] }
      )
      .toBe(true)

    // The driver never saw/clicked "Kaporayı Aldım, Onayla" — if it's still
    // on the page, auto-approval didn't actually happen and some other
    // booking/state is showing "Onaylandı" instead.
    await expect(driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true })).not.toBeVisible()
  })

  test("after the ride departs, a matching settlement receipt auto-settles the remaining payment for both sides", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    // Confirms the button is genuinely shown pre-settlement (payment_status
    // still 'deposit_confirmed') — otherwise the "not visible" check below
    // would be trivially true for the wrong reason.
    await expect(passengerPage.getByRole("button", { name: "Kalan Ödeme Tamamlandı", exact: true })).toBeVisible()

    // Settlement is the remaining 75% of the fare, not another 25% — cost_share
    // (200) * seat_count (1) * 0.75 = 150.
    const receipt = await realisticReceiptFilePayload(passengerPage, "settlement.png", "TR33 0006 1005 1978 6457 8413 26", 150)
    await passengerPage.locator('input[type="file"]').setInputFiles(receipt)
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    // Auto-settlement confirms *both* sides at once (see 0054's comment for
    // why) — the "Kalan Ödeme Tamamlandı" button disappears once
    // payment_status reaches 'settled', on both the passenger's and driver's
    // pages, without either of them clicking it. Generous timeout for the
    // same Tesseract cold-start variance as the deposit test above.
    await expect
      .poll(
        async () => {
          await passengerPage.goto("/bookings")
          return passengerPage.getByRole("button", { name: "Kalan Ödeme Tamamlandı", exact: true }).isVisible()
        },
        { timeout: 45_000, intervals: [1_000, 2_000, 3_000, 5_000] }
      )
      .toBe(false)

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByRole("button", { name: "Kalan Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
