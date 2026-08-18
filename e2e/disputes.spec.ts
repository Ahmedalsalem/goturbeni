import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, makeAdminForTest, signUpAndVerify, uniqueEmail, uniqueSuffix } from "./utils"

// Coverage for the formal dispute-resolution flow added in
// 0044_disputes.sql (open_dispute / admin_set_dispute_status), previously
// only unit-tested (src/features/disputes/actions.test.ts). Exercises the
// full lifecycle: passenger reports a problem on an approved booking, the
// button becomes disabled/badged for that same booking, and an admin walks
// it open -> in_review -> resolved with a note on /admin/disputes.
//
// /admin/disputes lists every open/resolved dispute across the whole
// database, including ones concurrently-running specs create (e.g.
// fraud-detection.spec.ts's "disputed repeatedly" block, which never
// resolves its own) — every locator below is scoped to this dispute's own
// `[data-slot="card"]`, filtered by a uniqueSuffix()-tagged description, not
// a bare page-wide getByText/getByRole.
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
  let description: string
  let resolutionNote: string

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
    description = `Sürücü parayı hâlâ göndermedi, iki gündür bekliyorum. (${uniqueSuffix()})`
    await passengerPage.getByPlaceholder("Yaşadığınız sorunu açıklayın (en az 10 karakter)").fill(description)
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
    const myCard = adminPage.locator('[data-slot="card"]').filter({ hasText: description })
    await expect(myCard.getByText("Ödeme Alınmadı")).toBeVisible()

    await myCard.getByRole("button", { name: "İncelemeye Al", exact: true }).click()
    await expect(adminPage.getByText("Anlaşmazlık durumu güncellendi.")).toBeVisible()
    // startReview only renders while status === 'open' — confirms the
    // status actually advanced server-side, not just a toast firing.
    await expect(myCard.getByRole("button", { name: "İncelemeye Al", exact: true })).toHaveCount(0)

    resolutionNote = `Sürücüyle görüşüldü, dekont karşılığında ödeme yapılmış. (${uniqueSuffix()})`
    await myCard.getByPlaceholder("Sonuç notu (isteğe bağlı, taraflara gösterilir)").fill(resolutionNote)
    await myCard.getByRole("button", { name: "Çözüldü Olarak Kapat", exact: true }).click()
    await expect(adminPage.getByText("Anlaşmazlık durumu güncellendi.")).toBeVisible()

    // Resolved disputes move to the second section and lose their action
    // buttons entirely — re-fetch the page (router.refresh already ran, but
    // a hard reload also proves resolved-dispute queries pick it up). myCard
    // is a lazy locator (re-queries on every use), so it still finds the
    // same dispute's now-relocated card after the reload.
    await adminPage.reload()
    const resolvedCard = adminPage.locator('[data-slot="card"]').filter({ hasText: description })
    await expect(resolvedCard.getByText(resolutionNote)).toBeVisible()
    await expect(resolvedCard.getByRole("button", { name: "Çözüldü Olarak Kapat", exact: true })).toHaveCount(0)
  })
})
