import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import {
  backdateAccountAge,
  backdateRideDeparture,
  createRide,
  makeAdminForTest,
  receiptFilePayload,
  signUpAndVerify,
  uniqueEmail,
  uniqueIban,
  uniqueSuffix,
} from "./utils"

// Coverage for risk-tiered bulk receipt approval added in
// 0047_bulk_receipt_review.sql (admin_bulk_approve_receipts +
// src/features/admin/risk.ts's computeReceiptRiskTier), previously only
// unit-tested (src/features/admin/risk.test.ts). A "low" tier needs an
// account >=14 days old with no suspicious/disputed/rejection history — a
// freshly signed-up e2e passenger never qualifies on its own, so this test
// backdates the account the same way settlement-ocr-auto-approval.spec.ts
// does for its own 14-day gate. The receipt itself is the blank
// receiptFilePayload (not a realistic IBAN/amount screenshot) specifically
// so OCR auto-approval (0054) never fires and the receipt stays pending —
// this test is about the manual bulk-approve path, not OCR.
test.describe.serial("bulk receipt approval", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let adminEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let adminContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let adminPage: Page
  let rideId: string
  let passengerLabel: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("bulkDriver")
    passengerEmail = uniqueEmail("bulkPassenger")
    adminEmail = uniqueEmail("bulkAdmin")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    adminContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
    adminPage = await adminContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
    await adminContext.close()
  })

  test("driver and passenger sign up, admin account is promoted, passenger's account is backdated", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)
    // 14 days is TRUSTED_ACCOUNT_MIN_AGE_DAYS (src/features/admin/risk.ts) —
    // 15 clears it with margin.
    await backdateAccountAge(passengerEmail, 15)
    // Unique display name so this booking's row can be located precisely on
    // the shared /admin/payments page even when other specs' pending
    // receipts are visible at the same time.
    passengerLabel = `E2E Bulk Passenger ${uniqueSuffix()}`
    await passengerPage.goto("/profile")
    await passengerPage.locator("#fullName").fill(passengerLabel)
    await passengerPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(passengerPage.getByText("Profil güncellendi.")).toBeVisible()
  })

  test("driver creates a bank-transfer ride, passenger books, driver approves", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "Trabzon",
      arrivalCity: "Rize",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 70,
    })
    expect(rideId).toBeTruthy()

    // createRide() always sets the driver's IBAN to the same fixed value
    // every other spec's driver also uses — give this one a unique IBAN so
    // this receipt's card never collides with a concurrently-running spec's
    // identical-IBAN row (payment-review.spec.ts asserts on that exact IBAN
    // text with a strict, unscoped getByText).
    await driverPage.goto("/profile")
    await driverPage.locator("#iban").fill(uniqueIban())
    await driverPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(driverPage.getByText("Profil güncellendi.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, the passenger uploads a settlement receipt that stays pending (no OCR match)", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("bulk-settlement.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()
  })

  test("admin sees it tagged low-risk and bulk-approves it", async () => {
    await adminPage.goto("/admin/payments")
    const myCard = adminPage.locator('[data-slot="card"]').filter({ hasText: passengerLabel })
    await expect(myCard.getByText("Düşük Risk")).toBeVisible()

    // The bulk-approve button covers every low-risk pending receipt site-
    // wide (admin_bulk_approve_receipts has no per-test scope) — if another
    // spec's low-risk receipt is pending at the same instant, the button's
    // count is >1, not literally "1". Assert the pattern, not an exact
    // count; the real proof this test cares about is the passenger's own
    // booking below, which is unaffected by how many other rows also got
    // swept up in the same click.
    const bulkApproveButton = adminPage.getByRole("button", { name: /düşük riskli dekontu onayla/ })
    await expect(bulkApproveButton).toBeVisible()
    await bulkApproveButton.click()
    await expect(adminPage.getByText(/dekont onaylandı\./)).toBeVisible()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Ödeme dekontu onaylandı")).toBeVisible()
  })
})
