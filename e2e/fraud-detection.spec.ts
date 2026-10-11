import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import {
  createRide,
  makeAdminForTest,
  signUpAndVerify,
  uniqueEmail,
  uniqueSuffix,
} from "./utils"

// Coverage for the disputed_repeatedly fraud signal
// (0046_suspicious_accounts_fraud_v2.sql). duplicate_iban and
// repeated_receipt_rejection can no longer fire since IBANs and receipts were
// removed (0101_remove_receipts_and_iban.sql). It reads from /admin/users, a
// page that lists every matching row across
// the whole database — every locator below is scoped to a `[data-slot=
// "card"]` container filtered by a uniqueSuffix()-tagged name, not a bare
// page-wide getByText, specifically because these pages are shared with
// every other concurrently-running spec (and with retries of these same
// blocks, which re-run beforeAll but don't delete a failed attempt's rows).
const CARD_SELECTOR = '[data-slot="card"]'

// Coverage for disputed_repeatedly: >=2 disputes against the same user, any
// status except 'dismissed'. Two unrelated passengers each open a dispute
// against the same driver on two separate rides — separate bookings (not the
// same one twice) so disputes_one_active_per_booking_opener never gets in
// the way.
test.describe.serial("fraud detection — disputed repeatedly", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerAEmail: string
  let passengerBEmail: string
  let adminEmail: string
  let driverContext: BrowserContext
  let passengerAContext: BrowserContext
  let passengerBContext: BrowserContext
  let adminContext: BrowserContext
  let driverPage: Page
  let passengerAPage: Page
  let passengerBPage: Page
  let adminPage: Page
  let driverLabel: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("disputedDriver")
    passengerAEmail = uniqueEmail("disputedPassA")
    passengerBEmail = uniqueEmail("disputedPassB")
    adminEmail = uniqueEmail("disputedAdmin")
    driverContext = await browser.newContext()
    passengerAContext = await browser.newContext()
    passengerBContext = await browser.newContext()
    adminContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerAPage = await passengerAContext.newPage()
    passengerBPage = await passengerBContext.newPage()
    adminPage = await adminContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerAContext.close()
    await passengerBContext.close()
    await adminContext.close()
  })

  async function bookAndApprove(passengerPage: Page, rideId: string) {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  }

  async function openDispute(passengerPage: Page) {
    await passengerPage.goto("/bookings")
    await passengerPage.getByRole("button", { name: "Sorun Bildir", exact: true }).first().click()
    await passengerPage
      .getByPlaceholder("Yaşadığınız sorunu açıklayın (en az 10 karakter)")
      .fill(`Sürücüyle ilgili bir sorun yaşadım, incelenmesini istiyorum. (${uniqueSuffix()})`)
    await passengerPage.getByRole("button", { name: "Gönder", exact: true }).click()
    await expect(passengerPage.getByText("Bildiriminiz alındı, ekibimiz inceleyecek.")).toBeVisible()
  }

  test("two different passengers each open a dispute against the same driver, on separate rides", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerAPage, passengerAEmail)
    await signUpAndVerify(passengerBPage, passengerBEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)

    // createRide() (e2e/utils.ts) always sets #fullName to the generic
    // "E2E Sürücü" as part of its own plate/color setup — every other spec's
    // driver shares that exact name, which would make a name-based locator
    // on /admin/users ambiguous across parallel test runs. The rename must
    // happen AFTER both createRide() calls (each one resets it), not before.
    const rideAId = await createRide(driverPage, {
      departureCity: "Eskişehir",
      arrivalCity: "Kütahya",
      minutesAhead: 30,
      seatCount: 1,
      costShare: 50,
    })
    const rideBId = await createRide(driverPage, {
      departureCity: "Afyonkarahisar",
      arrivalCity: "Uşak",
      minutesAhead: 30,
      seatCount: 1,
      costShare: 50,
    })

    driverLabel = `E2E Disputed Driver ${uniqueSuffix()}`
    await driverPage.goto("/profile")
    await driverPage.locator("#fullName").fill(driverLabel)
    await driverPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(driverPage.getByText("Profil güncellendi.")).toBeVisible()

    await bookAndApprove(passengerAPage, rideAId)
    await openDispute(passengerAPage)
    await bookAndApprove(passengerBPage, rideBId)
    await openDispute(passengerBPage)
  })

  test("admin sees the driver flagged as disputed_repeatedly on /admin/users", async () => {
    await adminPage.goto("/admin/users")
    const myCard = adminPage.locator(CARD_SELECTOR).filter({ hasText: driverLabel })
    await expect(myCard.getByText("Tekrarlayan anlaşmazlık konusu")).toBeVisible()
    await expect(myCard.getByText("2 anlaşmazlıkta şikayet edilen taraf")).toBeVisible()
  })
})

