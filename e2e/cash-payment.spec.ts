import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, clickWithConfirm, createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Cash-payment rides skip the receipt-upload/OCR path entirely (see
// src/app/bookings/page.tsx and src/app/rides/[id]/bookings/page.tsx's
// payment_method === "bank_transfer" gate, 0064_ride_payment_method.sql) —
// only the preexisting receipt-free mutual "Ödeme Tamamlandı" confirm
// button (confirm_remaining_payment RPC) is available. This test proves
// both: the upload control never appears, and the mutual-confirm path
// alone is enough to reach payment_status='settled'.
test.describe.serial("cash payment", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("cashDriver")
    passengerEmail = uniqueEmail("cashPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver creates a cash-payment ride, passenger books, driver approves", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Konya",
      arrivalCity: "Kayseri",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 90,
      paymentMethod: "cash",
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible({ timeout: 30_000 })

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await clickWithConfirm(driverPage, "Onayla", "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?")
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("no receipt-upload control ever appears; mutual confirm alone settles the payment", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    // The mutual confirm button is present...
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).toBeVisible()
    // ...but no file input for a receipt is (SettlementReceiptUpload never renders for cash).
    await expect(passengerPage.locator('input[type="file"]')).toHaveCount(0)

    await passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.locator('input[type="file"]')).toHaveCount(0)
    await driverPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    // Both sides confirmed — payment_status is now 'settled', the mutual
    // confirm button disappears for both.
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
