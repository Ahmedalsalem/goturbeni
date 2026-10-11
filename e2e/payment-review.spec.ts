import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, createRide, selectCombobox, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the bank-transfer payment path now that the platform no
// longer collects IBANs or receipts (0101_remove_receipts_and_iban.sql): the
// passenger is told to get the IBAN in chat, and the booking settles the same
// way a cash one does — both sides tap "Ödeme Tamamlandı". Also keeps the
// geographic nearby-province search fallback (turkish-provinces-geo.ts).
test.describe.serial("bank-transfer payment and nearby-province search", () => {
  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("payDriver")
    passengerEmail = uniqueEmail("payPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver and passenger sign up", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
  })

  test("driver creates a bank-transfer ride with pets/smoking allowed", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "İstanbul",
      arrivalCity: "Ankara",
      minutesAhead: 30,
      seatCount: 1,
      costShare: 200,
      petsAllowed: true,
      smokingAllowed: true,
      paymentMethod: "bank_transfer",
    })
    expect(rideId).toBeTruthy()
  })

  test("searching a geographically nearby province (no exact match) surfaces the ride", async () => {
    // Kocaeli has no rides of its own, but is within the province-geo
    // fallback radius of İstanbul (turkish-provinces-geo.ts, ~80km apart).
    await passengerPage.goto("/rides")
    await selectCombobox(passengerPage, "filter-from", "Kocaeli")
    await passengerPage.getByRole("button", { name: "Ara", exact: true }).click()
    await passengerPage.waitForURL(/\/rides\?/)

    await expect(passengerPage.getByText("coğrafi olarak yakın illerdeki seçenekler")).toBeVisible()
    // Matched by href, not route-name text — other specs create İstanbul→Ankara
    // rides too, which would make a text match a strict-mode violation.
    await expect(passengerPage.locator(`a[href="/rides/${rideId}"]`)).toBeVisible()
  })

  test("passenger books, driver approves, passenger is told to get the IBAN in chat", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await expect(passengerPage.getByText("Havale ile ödeyeceksen IBAN bilgisini sohbetten sürücüden iste.", { exact: false })).toBeVisible()
    await expect(passengerPage.getByText("Ödenecek tutar:", { exact: false })).toBeVisible()
  })

  test("after the ride departs, no receipt upload exists and mutual confirm settles the payment", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    await expect(passengerPage.locator('input[type="file"]')).toHaveCount(0)
    await passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.locator('input[type="file"]')).toHaveCount(0)
    await driverPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
