import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, createRide, logIn, selectCombobox, signUpAndVerify, TEST_PASSWORD, uniqueEmail } from "./utils"

// End-to-end regression for the three flows that were previously only
// hand-verified against a real Supabase project and then deleted (see
// PROJECT_STATUS.md): booking request/approve, realtime 1:1 chat, and the
// post-departure mutual review. Runs as one serial journey (two persistent
// browser contexts, one per account) rather than three isolated specs
// because each step depends on state produced by the previous one.
test.describe.serial("booking, chat, and review flow", () => {
  // Scoped to this file only (see playwright.config.ts for why retries
  // aren't global): the chat test below has no optimistic append, so the
  // sender only sees their own message once the Realtime postgres_changes
  // INSERT event round-trips back — inherently sensitive to websocket
  // delivery latency, and it started intermittently missing its 15s window
  // once the suite grew another spec file ahead of it in the same
  // single-worker run. A retry here re-runs the whole serial journey from
  // "driver and passenger sign up" — driverEmail/passengerEmail are
  // (re-)generated in beforeAll (which itself re-runs per retry attempt),
  // not as file-scope consts, so a retry signs up fresh accounts instead of
  // re-submitting the same already-registered email from the failed attempt.
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("driver")
    passengerEmail = uniqueEmail("passenger")
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
    await expect(driverPage).toHaveURL(/\/profile$/)

    await signUpAndVerify(passengerPage, passengerEmail)
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

    // Matched by href to this specific rideId, not by route-name text — other
    // spec files (and, with retries, a previous attempt of this same file)
    // can leave other Ankara→İstanbul rides in the DB, which would otherwise
    // make this a strict-mode violation (multiple matching links).
    await passengerPage.locator(`a[href="/rides/${rideId}"]`).click()
    await passengerPage.waitForURL(new RegExp(`/rides/${rideId}$`))

    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()
  })

  test("driver approves the booking and seat count updates", async () => {
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "İlk Yarı Ödemesini Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "İlk yarı ödemesini aldığınızı onaylıyor musunuz?", exact: true }).click()
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

  // Regression for a real UX complaint: an unread chat message used to only
  // light up the generic profile-menu dot, with neither "Benim İlanlarım"
  // nor "Rezervasyonlarım" showing anything — so opening the menu gave no
  // clue which one had it. getUnreadNavBadges (src/features/notifications/queries.ts)
  // now folds a ride's unread messages into whichever of those two the
  // recipient's role on that ride actually is.
  test("an unread chat message lights up the recipient's specific nav item, not just the generic dot", async () => {
    // The driver must not be on the chat page when this is sent, or the
    // message gets marked read the instant it renders (see ChatWindow's
    // markMessagesRead) and there'd be nothing left unread to test.
    await driverPage.goto("/")

    const followUpMessage = `Az kaldı, 5 dakikaya oradayım. ${Date.now()}`
    await passengerPage.getByLabel("Bir mesaj yaz...").fill(followUpMessage)
    await passengerPage.getByRole("button", { name: "Gönder" }).click()
    await expect(passengerPage.getByText(followUpMessage)).toBeVisible({ timeout: 15_000 })

    await driverPage.reload()
    await driverPage.getByRole("button", { name: "Profil", exact: true }).click()
    const myRidesItem = driverPage.getByRole("menuitem", { name: /Benim İlanlarım/ })
    await expect(myRidesItem.locator(".bg-destructive")).toBeVisible()
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
    await expect(driverPage.getByText("4.0", { exact: true })).toBeVisible()

    await passengerPage.goto("/profile")
    await expect(passengerPage.getByText("5.0", { exact: true })).toBeVisible()
  })

  test("driver can log back in with the same credentials", async () => {
    await driverContext.clearCookies()
    await logIn(driverPage, driverEmail, TEST_PASSWORD)
    await expect(driverPage).toHaveURL(/\/rides$/)
  })
})
