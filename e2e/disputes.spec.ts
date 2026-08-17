import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, makeAdminForTest, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the formal dispute-resolution flow added in
// 0044_disputes.sql (open_dispute / admin_set_dispute_status), previously
// only unit-tested (src/features/disputes/actions.test.ts). Exercises the
// full lifecycle: passenger reports a problem on an approved booking, the
// button becomes disabled/badged for that same booking, and an admin walks
// it open -> in_review -> resolved with a note on /admin/disputes.
test.describe.serial("disputes", () => {
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
    driverEmail = uniqueEmail("disputeDriver")
    passengerEmail = uniqueEmail("disputePassenger")
    adminEmail = uniqueEmail("disputeAdmin")
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

  test("driver creates a ride, passenger books, driver approves", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "Adana",
      arrivalCity: "Mersin",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 80,
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("passenger opens a dispute, the report button becomes a disabled badge", async () => {
    await passengerPage.goto("/bookings")
    await passengerPage.getByRole("button", { name: "Sorun Bildir", exact: true }).first().click()
    // Default reason (payment_not_received) is left as-is — only the
    // description is required input, keeping the Base UI Select untouched
    // avoids an unnecessary extra interaction surface for this test.
    await passengerPage
      .getByPlaceholder("Yaşadığınız sorunu açıklayın (en az 10 karakter)")
      .fill("Sürücü parayı hâlâ göndermedi, iki gündür bekliyorum.")
    await passengerPage.getByRole("button", { name: "Gönder", exact: true }).click()
    await expect(passengerPage.getByText("Bildiriminiz alındı, ekibimiz inceleyecek.")).toBeVisible()

    // alreadyOpen is derived server-side (getMyDisputeForBooking) — reload
    // to confirm the durable DB state, not just the optimistic client toast.
    await passengerPage.reload()
    await expect(passengerPage.getByRole("button", { name: "Bildirildi, inceleniyor", exact: true })).toBeVisible()
    await expect(passengerPage.getByRole("button", { name: "Bildirildi, inceleniyor", exact: true })).toBeDisabled()
  })

  test("admin sees the open dispute, starts review, then resolves it with a note", async () => {
    await adminPage.goto("/admin/disputes")
    await expect(adminPage.getByText("Ödeme Alınmadı")).toBeVisible()
    await expect(adminPage.getByText("Sürücü parayı hâlâ göndermedi, iki gündür bekliyorum.")).toBeVisible()

    await adminPage.getByRole("button", { name: "İncelemeye Al", exact: true }).click()
    await expect(adminPage.getByText("Anlaşmazlık durumu güncellendi.")).toBeVisible()
    // startReview only renders while status === 'open' — confirms the
    // status actually advanced server-side, not just a toast firing.
    await expect(adminPage.getByRole("button", { name: "İncelemeye Al", exact: true })).toHaveCount(0)

    await adminPage.getByPlaceholder("Sonuç notu (isteğe bağlı, taraflara gösterilir)").fill("Sürücüyle görüşüldü, dekont karşılığında ödeme yapılmış.")
    await adminPage.getByRole("button", { name: "Çözüldü Olarak Kapat", exact: true }).click()
    await expect(adminPage.getByText("Anlaşmazlık durumu güncellendi.")).toBeVisible()

    // Resolved disputes move to the second section and lose their action
    // buttons entirely — re-fetch the page (router.refresh already ran, but
    // a hard reload also proves resolved-dispute queries pick it up).
    await adminPage.reload()
    await expect(adminPage.getByText("Sürücüyle görüşüldü, dekont karşılığında ödeme yapılmış.")).toBeVisible()
    await expect(adminPage.getByRole("button", { name: "Çözüldü Olarak Kapat", exact: true })).toHaveCount(0)
  })
})
