import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { clickWithConfirm, createPassengerListing, signUpAndVerify, uniqueEmail } from "./utils"

// Uçtan uca ters rezervasyon: yolcu ilanı açar, sürücü teklif verir, yolcu
// teklifi kabul eder, driver_id atanır — ardından normal chat/pickup akışının
// (sürücü ilanındaki ile birebir aynı kod yolu, sadece hangi tarafın hangi
// rolü oynadığı ters) sorunsuz çalıştığını doğrular.
test.describe.serial("passenger listing reverse booking", () => {
  // Scoped to this file only (see playwright.config.ts for why retries
  // aren't global): observed two independent CI runs (an initial attempt and
  // its own retry, both against fresh accounts/data) fail identically at the
  // "Teklif kabul edildi." assertion below, with no Playwright-level click
  // error and no server-side error logged either time — the response simply
  // didn't land inside the default 5s window. NOTE: an earlier version of
  // this comment claimed this test's approveBooking call was the only one in
  // the suite to take the posted_by_role==='passenger' branch — that's false
  // (the "passenger cannot approve..." test three lines below takes the same
  // branch and passes at the default 5s timeout), so the extra-queries-in-
  // approveBooking theory alone doesn't explain the gap. The more likely
  // factor: this is the first test in the whole suite to reach an *approved*
  // booking on a passenger-posted ride, so the post-approval re-render of
  // /rides/[id]/bookings mounts several client components
  // (ShareLocationToggle, VerifyPickupCodeForm, SettlePaymentButton,
  // ReviewButton, ReportNoShowButton, OpenDisputeButton) for the first time
  // in this run — under `next dev --turbopack` those compile on demand
  // inside the server action's response, the same class of cold-compile
  // latency playwright.config.ts and receipt-ocr-auto-approval.spec.ts
  // already document (the latter uses a 30s timeout for exactly this
  // reason, matched below rather than the 15s originally used here). Two
  // real optimizations were also made to approveBooking/rejectBooking
  // (src/features/bookings/actions.ts) as part of diagnosing this — fewer
  // sequential queries and notifications deferred to after() — but a cold
  // Turbopack compile of a whole new component subtree isn't something a
  // server action can route around, hence the generous timeout staying in
  // place regardless. The retries:1 here is a safety margin on top of the
  // timeout increase, not a substitute for it — a retry re-runs the whole
  // serial journey from "passenger and driver sign up" — passengerEmail/
  // driverEmail are (re-)generated in beforeAll (which itself re-runs per
  // retry attempt), not as file-scope consts, so a retry signs up fresh
  // accounts instead of re-submitting the same already-registered email
  // from the failed attempt (same reasoning as booking-chat-review.spec.ts).
  test.describe.configure({ retries: 1 })

  let passengerEmail: string
  let driverEmail: string
  let passengerContext: BrowserContext
  let driverContext: BrowserContext
  let passengerPage: Page
  let driverPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    passengerEmail = uniqueEmail("plpassenger")
    driverEmail = uniqueEmail("pldriver")
    passengerContext = await browser.newContext()
    driverContext = await browser.newContext()
    passengerPage = await passengerContext.newPage()
    driverPage = await driverContext.newPage()
  })

  test.afterAll(async () => {
    await passengerContext.close()
    await driverContext.close()
  })

  test("passenger creates a passenger listing", async () => {
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createPassengerListing(passengerPage, {
      departureCity: "Bursa",
      arrivalCity: "Eskişehir",
      minutesAhead: 60,
      seatCount: 2,
      costShare: 80,
    })
  })

  test("driver makes an offer without needing IBAN/plate upfront", async () => {
    await signUpAndVerify(driverPage, driverEmail)

    await driverPage.goto(`/rides/${rideId}`)
    await driverPage.getByRole("button", { name: "Teklif Ver", exact: true }).click()
    await expect(driverPage.getByText("Teklifiniz gönderildi.")).toBeVisible()
  })

  test("passenger cannot approve without the driver's IBAN/plate set", async () => {
    await passengerPage.goto(`/rides/${rideId}/bookings`)
    await clickWithConfirm(passengerPage, "Teklifi Kabul Et", "Teklifi kabul etmek istediğinize emin misiniz?")
    await expect(passengerPage.getByText("Bu teklifi kabul edemezsiniz — teklif veren sürücünün IBAN bilgisi eksik.")).toBeVisible()
  })

  test("driver adds IBAN/plate, passenger approves the offer", async () => {
    await driverPage.goto("/profile")
    await driverPage.locator("#fullName").fill("E2E Teklif Sürücüsü")
    await driverPage.locator("#iban").fill("TR330006100519786457841326")
    // Kasıtlı olarak fullName'den FARKLI — /bookings sayfasındaki depozito
    // talimatları bölümü iban_holder_name'i düz metin olarak render ediyor
    // (src/app/bookings/page.tsx), bu yüzden aynı değer kullanılırsa aşağıdaki
    // "sanity: no stray duplicate text" kontrolü (driver'ın adının GÖRÜNMEMESİ
    // gerektiği) hesap sahibi adıyla çakışıp yanlışlıkla başarısız olurdu.
    await driverPage.locator("#ibanHolderName").fill("E2E Teklif Hesap Sahibi")
    await driverPage.locator("#carPlate").fill("34 ABC 789")
    await driverPage.getByRole("button", { name: "Kaydet" }).click()
    await driverPage.getByText("Profil güncellendi.").waitFor()

    await passengerPage.goto(`/rides/${rideId}/bookings`)
    await clickWithConfirm(passengerPage, "Teklifi Kabul Et", "Teklifi kabul etmek istediğinize emin misiniz?")
    // { timeout: 30_000 }: see the test.describe.configure comment above —
    // matches receipt-ocr-auto-approval.spec.ts's precedent for a cold
    // Turbopack compile inside a server action's response window.
    await expect(passengerPage.getByText("Teklif kabul edildi.")).toBeVisible({ timeout: 30_000 })
  })

  test("approval assigns driver_id — passenger sees deposit instructions, driver reaches the ride's management page", async () => {
    // Task 2'nin depozito-sırası düzeltmesi: onay depozitoyu OTOMATİK
    // "alındı" saymıyor — /bookings'te IBAN + dekont yükleme ekranı çıkmalı.
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("E2E Teklif Sürücüsü")).not.toBeVisible() // sanity: no stray duplicate text
    await expect(passengerPage.getByText("TR330006100519786457841326")).toBeVisible()

    // driver_id artık teklif veren sürücü olduğundan, sürücü ride'ın
    // /bookings yönetim sayfasına (ilan sahibi olmadığı hâlde) erişebilmeli.
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByText("E2E Teklif Sürücüsü")).not.toBeVisible() // kendi adını değil, karşı tarafı (yolcuyu) görmeli
  })
})
