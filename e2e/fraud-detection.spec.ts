import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import {
  backdateRideDeparture,
  createRide,
  makeAdminForTest,
  receiptFilePayload,
  signUpAndVerify,
  uniqueEmail,
  uniqueIban,
  uniqueSuffix,
} from "./utils"

// Coverage for all three fraud-detection-v2 signals added in
// 0046_suspicious_accounts_fraud_v2.sql (duplicate_iban, disputed_repeatedly,
// repeated_receipt_rejection — unchanged in the current 0062 redefinition of
// get_suspicious_accounts_internal), previously verified only via the
// migration's own SQL, never through the UI. All three read from
// /admin/users or /admin/payments, pages that list every matching row across
// the whole database — every locator below is scoped to a `[data-slot=
// "card"]` container filtered by a uniqueSuffix()-tagged name, not a bare
// page-wide getByText, specifically because these pages are shared with
// every other concurrently-running spec (and with retries of these same
// blocks, which re-run beforeAll but don't delete a failed attempt's rows).
const CARD_SELECTOR = '[data-slot="card"]'

test.describe.serial("fraud detection — duplicate IBAN", () => {
  test.describe.configure({ retries: 1 })

  let userAEmail: string
  let userBEmail: string
  let adminEmail: string
  let userAContext: BrowserContext
  let userBContext: BrowserContext
  let adminContext: BrowserContext
  let userAPage: Page
  let userBPage: Page
  let adminPage: Page
  let userALabel: string
  let userBLabel: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    userAEmail = uniqueEmail("fraudA")
    userBEmail = uniqueEmail("fraudB")
    adminEmail = uniqueEmail("fraudAdmin")
    userAContext = await browser.newContext()
    userBContext = await browser.newContext()
    adminContext = await browser.newContext()
    userAPage = await userAContext.newPage()
    userBPage = await userBContext.newPage()
    adminPage = await adminContext.newPage()
  })

  test.afterAll(async () => {
    await userAContext.close()
    await userBContext.close()
    await adminContext.close()
  })

  test("two unrelated accounts register the same IBAN", async () => {
    await signUpAndVerify(userAPage, userAEmail)
    await signUpAndVerify(userBPage, userBEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)

    // A fresh random IBAN per attempt (not module-level, not this repo's
    // shared "TR330006100519786457841326" test IBAN) — computed inside the
    // test body so a retry gets a new one too, instead of reusing the failed
    // first attempt's value and ending up with 4 accounts sharing 1 IBAN.
    const sharedIban = uniqueIban()
    userALabel = `E2E Fraud A ${uniqueSuffix()}`
    userBLabel = `E2E Fraud B ${uniqueSuffix()}`

    await userAPage.goto("/profile")
    await userAPage.locator("#fullName").fill(userALabel)
    await userAPage.locator("#iban").fill(sharedIban)
    await userAPage.locator("#ibanHolderName").fill(userALabel)
    await userAPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(userAPage.getByText("Profil güncellendi.")).toBeVisible()

    await userBPage.goto("/profile")
    await userBPage.locator("#fullName").fill(userBLabel)
    await userBPage.locator("#iban").fill(sharedIban)
    await userBPage.locator("#ibanHolderName").fill(userBLabel)
    await userBPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(userBPage.getByText("Profil güncellendi.")).toBeVisible()
  })

  test("admin sees both accounts flagged as duplicate_iban on /admin/users", async () => {
    await adminPage.goto("/admin/users")
    const cardA = adminPage.locator(CARD_SELECTOR).filter({ hasText: userALabel })
    const cardB = adminPage.locator(CARD_SELECTOR).filter({ hasText: userBLabel })
    await expect(cardA.getByText("Aynı IBAN birden fazla hesapta")).toBeVisible()
    await expect(cardA.getByText("Aynı IBAN 2 hesapta kayıtlı")).toBeVisible()
    await expect(cardB.getByText("Aynı IBAN birden fazla hesapta")).toBeVisible()
    await expect(cardB.getByText("Aynı IBAN 2 hesapta kayıtlı")).toBeVisible()
  })
})

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
    // "E2E Sürücü" as part of its own IBAN/plate setup — every other spec's
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

// Coverage for repeated_receipt_rejection's passenger-side branch:
// sum(settlement_receipt_reject_count) >= 3 (no more deposit_receipt_reject_
// count since deposits were removed in the single-payment-at-settlement
// model). Rejects the SAME booking's settlement receipt three times in a
// row — settlement_receipt_reject_count is a per-booking counter
// (0045_fraud_v2_columns_and_enum.sql), so three rejects on one booking is
// equivalent to three across different ones for this rule's sum() and far
// simpler to set up.
test.describe.serial("fraud detection — repeated receipt rejection", () => {
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
    driverEmail = uniqueEmail("rejectDriver")
    passengerEmail = uniqueEmail("rejectPassenger")
    adminEmail = uniqueEmail("rejectAdmin")
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

  test("driver and passenger sign up, admin account is promoted, passenger's name is set for a unique locator", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)
    passengerLabel = `E2E Reject Passenger ${uniqueSuffix()}`
    await passengerPage.locator("#fullName").fill(passengerLabel)
    await passengerPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(passengerPage.getByText("Profil güncellendi.")).toBeVisible()
  })

  test("driver creates a ride, passenger books, driver approves, ride departs", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "Samsun",
      arrivalCity: "Ordu",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 65,
    })
    expect(rideId).toBeTruthy()

    // createRide() always sets the driver's IBAN to the same fixed value
    // every other spec's driver also uses — give this one a unique IBAN so
    // the three pending/rejected receipts below (and their card on
    // /admin/payments) never collide with a concurrently-running spec's
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

    await backdateRideDeparture(rideId, 10)
  })

  test("the same booking's settlement receipt is rejected three times in a row", async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await passengerPage.goto("/bookings")
      await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload(`reject-${attempt}.png`))
      await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

      await adminPage.goto("/admin/payments")
      const myCard = adminPage.locator(CARD_SELECTOR).filter({ hasText: passengerLabel })
      await myCard.getByRole("button", { name: "Reddet", exact: true }).click()
      await myCard.getByPlaceholder("Red gerekçesi").fill(`Deneme ${attempt}: dekont okunamıyor.`)
      await myCard.getByRole("button", { name: "Reddi Onayla", exact: true }).click()
      await expect(adminPage.getByText("Dekont reddedildi.")).toBeVisible()
    }
  })

  test("admin sees the passenger flagged as repeated_receipt_rejection on /admin/users", async () => {
    await adminPage.goto("/admin/users")
    const myCard = adminPage.locator(CARD_SELECTOR).filter({ hasText: passengerLabel })
    await expect(myCard.getByText("Tekrarlayan dekont/iade reddi")).toBeVisible()
    await expect(myCard.getByText("3 reddedilen dekont")).toBeVisible()
  })
})
