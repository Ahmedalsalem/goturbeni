import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, createRide, logIn, selectCombobox, signUp, TEST_PASSWORD, uniqueEmail } from "./utils"

// End-to-end regression for the three flows that were previously only
// hand-verified against a real Supabase project and then deleted (see
// PROJECT_STATUS.md): booking request/approve, realtime 1:1 chat, and the
// post-departure mutual review. Runs as one serial journey (two persistent
// browser contexts, one per account) rather than three isolated specs
// because each step depends on state produced by the previous one.
test.describe.serial("booking, chat, and review flow", () => {
  const driverEmail = uniqueEmail("driver")
  const passengerEmail = uniqueEmail("passenger")

  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
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
    await signUp(driverPage, driverEmail)
    await expect(driverPage).toHaveURL(/\/profile$/)

    await signUp(passengerPage, passengerEmail)
    await expect(passengerPage).toHaveURL(/\/profile$/)
  })

  test("driver creates a ride", async () => {
    rideId = await createRide(driverPage, {
      departureCity: "Ankara",
      arrivalCity: "İstanbul",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 100,
    })
    expect(rideId).toBeTruthy()
  })

  test("passenger finds the ride via filters and requests a booking", async () => {
    await passengerPage.goto("/rides")
    await selectCombobox(passengerPage, "filter-from", "Ankara")
    await selectCombobox(passengerPage, "filter-to", "İstanbul")

    await passengerPage.getByRole("button", { name: "Ara", exact: true }).click()
    await passengerPage.waitForURL(/\/rides\?/)

    await passengerPage.getByRole("link", { name: /Ankara.*İstanbul/ }).click()
    await passengerPage.waitForURL(new RegExp(`/rides/${rideId}$`))

    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()
  })

  test("driver approves the booking and seat count updates", async () => {
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Onaylansın mı?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
    await expect(driverPage.getByText("Onaylandı")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}`)
    await expect(driverPage.getByText("1 / 2 boş koltuk")).toBeVisible()
  })

  test("driver and passenger exchange realtime chat messages", async () => {
    const driverMessage = `Merhaba, yolda mısınız? ${Date.now()}`
    const passengerMessage = `Evet, hazırım! ${Date.now()}`

    await driverPage.goto(`/rides/${rideId}/chat`)
    await passengerPage.goto(`/rides/${rideId}/chat`)

    // ChatWindow has no optimistic append (see src/features/chat/ChatWindow.tsx)
    // — even the sender only sees their own message once the Realtime
    // postgres_changes INSERT event round-trips back, same as the counterpart.
    await driverPage.getByLabel("Bir mesaj yaz...").fill(driverMessage)
    await driverPage.getByRole("button", { name: "Gönder" }).click()
    await expect(driverPage.getByText(driverMessage)).toBeVisible({ timeout: 15_000 })
    await expect(passengerPage.getByText(driverMessage)).toBeVisible({ timeout: 15_000 })

    await passengerPage.getByLabel("Bir mesaj yaz...").fill(passengerMessage)
    await passengerPage.getByRole("button", { name: "Gönder" }).click()
    await expect(passengerPage.getByText(passengerMessage)).toBeVisible({ timeout: 15_000 })
    await expect(driverPage.getByText(passengerMessage)).toBeVisible({ timeout: 15_000 })
  })

  test("both sides leave a review after the ride departs", async () => {
    await backdateRideDeparture(rideId, 10)

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Yorum Yap" }).click()
    await driverPage.getByRole("button", { name: "5 / 5" }).click()
    await driverPage.getByRole("button", { name: "Yorumu Gönder" }).click()
    await expect(driverPage.getByText("Yorum yaptınız")).toBeVisible()

    await passengerPage.goto("/bookings")
    await passengerPage.getByRole("button", { name: "Yorum Yap" }).click()
    await passengerPage.getByRole("button", { name: "4 / 5" }).click()
    await passengerPage.getByRole("button", { name: "Yorumu Gönder" }).click()
    await expect(passengerPage.getByText("Yorum yaptınız")).toBeVisible()

    // Reviews show up on each side's profile.
    await driverPage.goto("/profile")
    await expect(driverPage.getByText("4.0")).toBeVisible()

    await passengerPage.goto("/profile")
    await expect(passengerPage.getByText("5.0")).toBeVisible()
  })

  test("driver can log back in with the same credentials", async () => {
    await driverContext.clearCookies()
    await logIn(driverPage, driverEmail, TEST_PASSWORD)
    await expect(driverPage).toHaveURL(/\/profile$/)
  })
})
