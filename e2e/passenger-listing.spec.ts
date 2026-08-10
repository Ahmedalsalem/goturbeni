import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { clickWithConfirm, createPassengerListing, signUpAndVerify, uniqueEmail } from "./utils"

// Uçtan uca ters rezervasyon: yolcu ilanı açar, sürücü teklif verir, yolcu
// teklifi kabul eder, driver_id atanır — ardından normal chat/pickup akışının
// (sürücü ilanındaki ile birebir aynı kod yolu, sadece hangi tarafın hangi
// rolü oynadığı ters) sorunsuz çalıştığını doğrular.
test.describe.serial("passenger listing reverse booking", () => {
  // Scoped to this file only (see playwright.config.ts for why retries
  // aren't global): three independent CI runs (two plain attempts plus a
  // retries:1 retry, all against fresh accounts/data, the last one even
  // after widening the assertion timeout to 30s AND optimizing
  // approveBooking to do fewer round-trips) all failed identically waiting
  // for the "Teklif kabul edildi." toast — but trace analysis on the third
  // run showed BOTH the click sequence and the underlying server-action POST
  // completing cleanly (HTTP 200, no error, landing well inside the 30s
  // window) — so this was never a raw latency problem, widening the timeout
  // was treating the wrong symptom. What actually correlates across all
  // three traces: a client-side "[Fast Refresh] rebuilding" event lands in
  // the same ~200ms window as the confirm click and/or the start of the
  // assertion's polling, every single time. This is the first test in the
  // whole suite to reach an *approved* offer on a passenger-posted ride as
  // its OWNER — i.e. the first live exercise of /rides/[id]/bookings's
  // dual-role counterparty/isFulfillingDriver render branch (added for
  // passenger listings) reaching its post-approval UI. Under `next dev
  // --turbopack`, compiling that branch's modules on demand triggers a
  // client HMR sync mid-request, which can unmount/remount the very
  // component whose pending React transition (confirming state, the
  // eventual toast() call) is in flight — dropping it, not delaying it. No
  // assertion timeout fixes a dropped client-side event, only a slow one, so
  // the fix here is to stop asserting on the ephemeral toast and instead
  // reload and check the durable, DB-backed outcome (the row switching from
  // the pending buttons to an "Onaylandı" status badge) — the same pattern
  // the next test in this file already uses to verify post-approval state.
  // retries:1 stays as a safety margin for anything else this cold-compile
  // window might still disrupt — a retry re-runs the whole serial journey
  // from "passenger and driver sign up" — passengerEmail/driverEmail are
  // (re-)generated in beforeAll (which itself re-runs per retry attempt),
  // not as file-scope consts, so a retry signs up fresh accounts instead of
  // re-submitting the same already-registered email from the failed attempt
  // (same reasoning as booking-chat-review.spec.ts).
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
    // Not asserting on the "Teklif kabul edildi." toast here — see the
    // test.describe.configure comment above for why it's an ephemeral,
    // droppable event on this specific first-render code path, not just a
    // slow one. Reload and check the durable, DB-backed outcome instead: the
    // pending "Teklifi Kabul Et"/"Reddet" buttons are replaced by a status
    // badge only once the booking is genuinely approved server-side.
    await passengerPage.reload()
    await expect(passengerPage.getByText("Onaylandı")).toBeVisible({ timeout: 30_000 })
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
