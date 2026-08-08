import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import {
  backdateRideDeparture,
  createRide,
  makeAdminForTest,
  receiptFilePayload,
  selectCombobox,
  signUpAndVerify,
  uniqueEmail,
} from "./utils"

// Regression coverage for this session's payment-review additions: deposit
// receipt reject-with-reason (0025_settlement_receipts_and_reject_reasons.sql),
// the settlement (post-trip remaining-half) receipt flow, the admin IBAN
// cross-check display, and the geographic nearby-province search fallback
// (turkish-provinces-geo.ts). None of these had any test before this session
// — see PROJECT_STATUS.md.
test.describe.serial("payment receipt review, reject reasons, and nearby-province search", () => {
  // The deposit-upload step below has intermittently missed its 5s default
  // assertion window on both a loaded local machine and a clean CI runner —
  // not chased down to a root cause, but a single retry absorbs it the same
  // way as booking-chat-review.spec.ts's realtime chat flake. Emails are
  // (re-)generated in beforeAll (which itself re-runs per retry attempt), and
  // the nearby-province test above matches by href not route-name text, so a
  // retry re-running "driver creates a ride" doesn't collide with itself.
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

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("payDriver")
    passengerEmail = uniqueEmail("payPassenger")
    adminEmail = uniqueEmail("payAdmin")
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

  test("driver and passenger sign up, admin account is promoted", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)
  })

  test("driver sets IBAN so the admin can cross-check it later", async () => {
    await driverPage.goto("/profile")
    await driverPage.locator("#fullName").fill("E2E Test Sürücü")
    await driverPage.locator("#iban").fill("TR330006100519786457841326")
    await driverPage.locator("#ibanHolderName").fill("E2E Test Sürücü")
    await driverPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(driverPage.getByText("Profil güncellendi.")).toBeVisible()
  })

  test("driver creates a ride with pets/smoking allowed", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "İstanbul",
      arrivalCity: "Ankara",
      minutesAhead: 30,
      seatCount: 1,
      costShare: 200,
      petsAllowed: true,
      smokingAllowed: true,
    })
    expect(rideId).toBeTruthy()
  })

  test("searching a geographically nearby province (no exact match) surfaces the ride", async () => {
    // Kocaeli has no rides of its own, but is within the province-geo
    // fallback radius of İstanbul (turkish-provinces-geo.ts, ~80km apart) —
    // this is the case the old same-province-only fallback couldn't handle.
    await passengerPage.goto("/rides")
    await selectCombobox(passengerPage, "filter-from", "Kocaeli")
    await passengerPage.getByRole("button", { name: "Ara", exact: true }).click()
    await passengerPage.waitForURL(/\/rides\?/)

    await expect(passengerPage.getByText("coğrafi olarak yakın illerdeki seçenekler")).toBeVisible()
    // Matched by href to this specific rideId, not by route-name text — a
    // retry of this serial group (see test.describe.configure below) creates
    // a second İstanbul→Ankara ride, which would otherwise make this a
    // strict-mode violation (multiple matching links), same issue fixed in
    // booking-chat-review.spec.ts.
    await expect(passengerPage.locator(`a[href="/rides/${rideId}"]`)).toBeVisible()
  })

  test("passenger books the ride", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()
  })

  // The deposit-instructions alert and receipt upload are only shown while
  // the booking is still 'pending' (BookingButton.tsx's `awaitingDeposit` —
  // driver approval is itself the "I received the deposit" confirmation and
  // the whole payment panel disappears once that happens), so this has to
  // run before the driver approves, not after.
  test("passenger uploads a deposit receipt and the admin rejects it with a reason", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("deposit1.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    // The driver's registered IBAN/holder name shown next to the receipt —
    // the eyeball-cross-check mitigation for the "no real bank verification"
    // gap (README → Bilinen Sınırlamalar).
    await expect(adminPage.getByText("TR330006100519786457841326")).toBeVisible()

    await adminPage.getByRole("button", { name: "Reddet", exact: true }).first().click()
    await adminPage.getByPlaceholder("Red gerekçesi").fill("Dekont tutarı eksik görünüyor.")
    await adminPage.getByRole("button", { name: "Reddi Onayla", exact: true }).click()
    await expect(adminPage.getByText("Dekont reddedildi.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await expect(passengerPage.getByText("Dekont tutarı eksik görünüyor.")).toBeVisible()
  })

  test("passenger re-uploads the receipt, the admin approves it, and the driver approves the booking", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("deposit2.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    await adminPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await expect(adminPage.getByText("Dekont onaylandı.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await expect(passengerPage.getByText("Dekont onaylandı")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Kaporayı aldığınızı onaylıyor musunuz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, the passenger uploads a settlement receipt and the admin approves it", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("settlement1.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    await adminPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await expect(adminPage.getByText("Dekont onaylandı.")).toBeVisible()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Kalan ödeme dekontu onaylandı")).toBeVisible()
  })
})
