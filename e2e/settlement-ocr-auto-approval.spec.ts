import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateAccountAge, backdateRideDeparture, createRide, realisticReceiptFilePayload, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the OCR-based settlement auto-approval
// (submit_settlement_receipt_ocr, 0054_settlement_ocr_auto_approval.sql,
// amount updated to the full fare by 0062_single_payment_at_settlement.sql):
// when an uploaded post-trip receipt's IBAN and amount match the ride's
// driver/full fare, the payment is confirmed automatically for both sides —
// neither party has to click a manual confirm button. The manual button
// stays as a fallback (covered by booking-chat-review.spec.ts and
// payment-review.spec.ts, both of which upload a receipt OCR can't match,
// confirming the manual flow is untouched). There is no more booking-level
// (pre-trip) OCR auto-approval — approval is now a plain manual driver
// decision, since there's nothing to pay before the ride.
test.describe.serial("settlement receipt OCR auto-approval", () => {
  // Same cold-compile-window flake class documented in payment-review.spec.ts
  // and passenger-listing.spec.ts — this is the other spec that exercises a
  // first-of-its-kind live path (auto-settlement via OCR) without ever
  // having run in CI before this branch. One retry, same reasoning: emails
  // are (re-)generated in beforeAll so a retry signs up fresh accounts
  // instead of resubmitting an already-registered address.
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("ocrDriver")
    passengerEmail = uniqueEmail("ocrPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver and passenger sign up, driver creates a ride, passenger books and the driver approves", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
    // The OCR auto-approval risk gate requires the passenger's account be
    // ≥14 days old (see utils.ts's backdateAccountAge) — a freshly signed-up
    // e2e account never qualifies otherwise, and without this the settlement
    // upload below would fall through to the manual-confirm fallback instead
    // of auto-settling.
    await backdateAccountAge(passengerEmail, 30)

    // createRide always sets the driver's IBAN to this exact value — the
    // settlement receipt below must match it for auto-approval to trigger.
    rideId = await createRide(driverPage, {
      departureCity: "Ankara",
      arrivalCity: "İstanbul",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 200,
    })
    expect(rideId).toBeTruthy()

    // First visit to /rides/[id] in this file — Turbopack compiles routes on
    // demand, so this can take longer than the default 5s assertion timeout
    // on a cold run (same class of issue as playwright.config.ts's other
    // cold-compile notes).
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible({ timeout: 30_000 })

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, a matching settlement receipt auto-settles the payment for both sides", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    // Confirms the button is genuinely shown pre-settlement (payment_status
    // still 'awaiting_settlement') — otherwise the "not visible" check below
    // would be trivially true for the wrong reason.
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).toBeVisible()

    // Full fare, not a percentage of it — cost_share (200) * seat_count (1,
    // the booking default) = 200.
    const receipt = await realisticReceiptFilePayload(passengerPage, "settlement.png", "TR33 0006 1005 1978 6457 8413 26", 200)
    await passengerPage.locator('input[type="file"]').setInputFiles(receipt)
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    // Auto-settlement confirms *both* sides at once (see 0054's comment for
    // why) — the "Ödeme Tamamlandı" button disappears once payment_status
    // reaches 'settled', on both the passenger's and driver's pages, without
    // either of them clicking it. Generous timeout for Tesseract's
    // worker_thread + WASM cold-start variance.
    await expect
      .poll(
        async () => {
          await passengerPage.goto("/bookings")
          return passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).isVisible()
        },
        { timeout: 45_000, intervals: [1_000, 2_000, 3_000, 5_000] }
      )
      .toBe(false)

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
