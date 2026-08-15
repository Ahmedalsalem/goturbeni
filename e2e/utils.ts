import { type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

export const TEST_PASSWORD = "Test1234!"

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`
}

// NOTE: registration now requires mandatory phone OTP verification (see
// src/app/verify-phone/page.tsx) — this helper fills the now-required
// phone/gender fields so the form submits, but lands on /verify-phone, not
// /profile. No SMS provider is configured for the local Supabase instance
// (see supabase/config.toml), so the OTP itself cannot be completed here;
// callers that need a fully verified session must go further (not yet
// implemented — see README known limitations).
export async function signUp(page: Page, email: string, password: string = TEST_PASSWORD): Promise<void> {
  await page.goto("/register")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.locator("#confirmPassword").fill(password)
  await page.locator("#phone").fill("05551234567")
  await page.locator("#gender").click()
  await page.getByRole("option", { name: "Kadın" }).click()
  // Required (schemas.ts: termsAccepted must be "on") — added for the
  // commercial-transport-ban acknowledgment, this helper was never updated
  // for it, so every signup silently failed native required-field validation
  // and "Hesap Oluştur" never submitted (see the "Please check this box"
  // browser tooltip in the CI failure screenshots). #termsAccepted itself
  // resolves to Base UI Checkbox's hidden native <input> (kept for native
  // form semantics) — the actually-clickable element is its styled sibling
  // span[role=checkbox], reachable via the aria-labelledby link Base UI sets
  // up to the FieldLabel ("{id}-label"). Clicking the label text directly
  // risks hitting the embedded Terms-of-Use <Link> instead.
  await page.locator('[aria-labelledby="termsAccepted-label"]').click()
  await page.getByRole("button", { name: "Hesap Oluştur" }).click()
  await page.waitForURL("**/verify-phone")
}

export async function logIn(page: Page, email: string, password: string = TEST_PASSWORD): Promise<void> {
  await page.goto("/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Giriş Yap" }).click()
  // signIn() (src/features/auth/actions.ts) redirects a verified user to
  // /rides, not /profile — "straight to ride search, that's what most users
  // came back to do."
  await page.waitForURL("**/rides")
}

// The city/district fields are Base UI Comboboxes (see
// src/components/ui/combobox.tsx): click to open, type to filter, click the
// matching option — there's no native <select> to drive directly.
export async function selectCombobox(page: Page, inputId: string, optionLabel: string): Promise<void> {
  const input = page.locator(`#${inputId}`)
  await input.click()
  await input.fill(optionLabel)
  await page.getByRole("option", { name: optionLabel, exact: true }).click()
}

// A departure date/time a few minutes in the future, in the Europe/Istanbul
// wall-clock format the RideForm's date/time inputs expect — must stay in
// sync with src/utils/istanbul-time.ts, which the app uses to parse it back.
export function nearFutureIstanbulDateTime(minutesAhead: number): { date: string; time: string } {
  const target = new Date(Date.now() + minutesAhead * 60_000)
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(target)
  return { date, time }
}

export async function createRide(
  page: Page,
  options: {
    departureCity: string
    arrivalCity: string
    minutesAhead: number
    seatCount: number
    costShare: number
    petsAllowed?: boolean
    smokingAllowed?: boolean
    vipSolo?: boolean
    paymentMethod?: "bank_transfer" | "cash"
    instantBooking?: boolean
  }
): Promise<string> {
  // createRide (src/features/rides/actions.ts) refuses to insert a ride
  // unless the driver's profile already has an IBAN + holder name (the
  // half-up-front/half-on-arrival payment flow needs it from the start) and,
  // as of the car-plate-format check, a valid Turkish plate on file too —
  // ensure both are set first so callers that don't otherwise care about
  // payment/vehicle info (most of them) don't hit either guard.
  await page.goto("/profile")
  await page.locator("#fullName").fill("E2E Sürücü")
  await page.locator("#iban").fill("TR330006100519786457841326")
  await page.locator("#ibanHolderName").fill("E2E Sürücü")
  await page.locator("#carPlate").fill("34 ABC 123")
  await page.getByRole("button", { name: "Kaydet" }).click()
  await page.getByText("Profil güncellendi.").waitFor()

  await page.goto("/create-ride")
  await selectCombobox(page, "departureCity", options.departureCity)
  await selectCombobox(page, "arrivalCity", options.arrivalCity)
  const { date, time } = nearFutureIstanbulDateTime(options.minutesAhead)
  await page.locator("#departureDate").fill(date)
  await page.locator("#departureTime").fill(time)
  await page.locator("#seatCount").fill(String(options.seatCount))
  await page.locator("#costShare").fill(String(options.costShare))
  // Same Base UI Checkbox pattern as termsAccepted in signUp() above — #ID
  // is the hidden native input, the clickable element is the sibling
  // span[role=checkbox][aria-labelledby="ID-label"].
  if (options.petsAllowed) {
    await page.locator('[aria-labelledby="petsAllowed-label"]').click()
  }
  if (options.smokingAllowed) {
    await page.locator('[aria-labelledby="smokingAllowed-label"]').click()
  }
  if (options.vipSolo) {
    await page.locator('[aria-labelledby="vipSolo-label"]').click()
  }
  if (options.paymentMethod === "cash") {
    await page.getByRole("button", { name: "Nakit", exact: true }).click()
  }
  if (options.instantBooking) {
    await page.locator('[aria-labelledby="instantBooking-label"]').click()
  }
  await page.getByRole("button", { name: "İlanı Yayınla" }).click()
  await page.waitForURL("**/rides/mine")

  const href = await page.getByRole("link", { name: "Rezervasyonlar" }).first().getAttribute("href")
  const match = href?.match(/\/rides\/([^/]+)\/bookings/)
  if (!match) {
    throw new Error(`Could not extract ride id from "Rezervasyonlar" link href: ${href}`)
  }
  return match[1]
}

// createRide'ın yolcu-modu versiyonu — IBAN/plaka profile gerekmiyor
// (createRide/actions.ts bu kontrolü passenger modda atlıyor), rol
// toggle'ından "Yolcuyum"a tıklanıyor, pets/smoking/vip alanları form
// tarafından zaten gizlendiği için hiç doldurulmuyor.
export async function createPassengerListing(
  page: Page,
  options: { departureCity: string; arrivalCity: string; minutesAhead: number; seatCount: number; costShare: number }
): Promise<string> {
  await page.goto("/create-ride")
  await page.getByRole("button", { name: "Yolcuyum", exact: true }).click()
  await selectCombobox(page, "departureCity", options.departureCity)
  await selectCombobox(page, "arrivalCity", options.arrivalCity)
  const { date, time } = nearFutureIstanbulDateTime(options.minutesAhead)
  await page.locator("#departureDate").fill(date)
  await page.locator("#departureTime").fill(time)
  await page.locator("#seatCount").fill(String(options.seatCount))
  await page.locator("#costShare").fill(String(options.costShare))
  await page.getByRole("button", { name: "İlanı Yayınla" }).click()
  await page.waitForURL("**/rides/mine")

  const href = await page.getByRole("link", { name: "Rezervasyonlar" }).first().getAttribute("href")
  const match = href?.match(/\/rides\/([^/]+)\/bookings/)
  if (!match) {
    throw new Error(`Could not extract ride id from "Rezervasyonlar" link href: ${href}`)
  }
  return match[1]
}

// Clicks a booking action button that requires a second confirming click
// (see src/features/bookings/BookingActions.tsx: "Onayla" -> "Onaylansın
// mı?", "Reddet" -> "Reddedilsin mi?").
export async function clickWithConfirm(page: Page, initialLabel: string, confirmLabel: string): Promise<void> {
  await page.getByRole("button", { name: initialLabel, exact: true }).click()
  await page.getByRole("button", { name: confirmLabel, exact: true }).click()
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be set to run e2e admin operations against the local Supabase instance`)
  }
  return value
}

// Bypasses RLS with the local instance's service role key — used only to
// backdate a ride's departure_time so the review flow's "ride has departed"
// window (see supabase/migrations/0005_reviews.sql) opens without a real
// multi-minute wait in the test.
export function createAdminClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function backdateRideDeparture(rideId: string, secondsAgo: number): Promise<void> {
  const admin = createAdminClient()
  const departureTime = new Date(Date.now() - secondsAgo * 1000).toISOString()
  const { error } = await admin.from("rides").update({ departure_time: departureTime }).eq("id", rideId)
  if (error) {
    throw error
  }
}

// The OCR auto-approval risk gate (submit_settlement_receipt_ocr,
// 0054_settlement_ocr_auto_approval.sql) requires the account be ≥14 days
// old — a freshly signed-up e2e test account never qualifies, so tests
// exercising the auto-approval path need to backdate it, same idea as
// backdateRideDeparture above.
export async function backdateAccountAge(email: string, daysAgo: number): Promise<void> {
  const admin = createAdminClient()
  const user = await findAuthUserByEmail(admin, email)
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await admin.from("profiles").update({ created_at: createdAt }).eq("id", user.id)
  if (error) {
    throw error
  }
}

// GoTrue lowercases stored emails; uniqueEmail()'s prefixes aren't always
// lowercase ("passengerA", "payDriver") so a case-sensitive match here always
// missed them — every prefix without an uppercase letter ("driver",
// "passenger") happened to work, which is what made this look intermittent.
// perPage passed explicitly too (@supabase/auth-js defaults to an empty
// query param otherwise) and a short retry kept as cheap insurance against
// any real propagation lag, though the case mismatch was the actual bug.
async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) {
      throw error
    }
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) {
      return user
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No auth user found for ${email} — was signUp() called first?`)
}

// Registration now requires mandatory phone OTP verification (see
// src/lib/supabase/dal.ts's requireVerifiedProfile, gating createRide/
// createBooking) and no SMS provider is configured for the local/CI
// Supabase instance (supabase/config.toml has no [auth.sms.test_otp] map),
// so the OTP itself can never be completed through the UI in this
// environment. Bypasses it the same way backdateRideDeparture bypasses the
// departure-time wait: flip profiles_private.phone_verified directly with
// the service-role client, exactly what a real completed OTP would have set.
export async function verifyPhoneForTest(email: string): Promise<void> {
  const admin = createAdminClient()
  const user = await findAuthUserByEmail(admin, email)
  const { error: updateError } = await admin.from("profiles_private").update({ phone_verified: true }).eq("id", user.id)
  if (updateError) {
    throw updateError
  }
}

// signUp() + the phone-verification bypass above, landing on /profile like
// a real completed registration would — the flow every test that needs to
// create a ride or a booking (both gated by requireVerifiedProfile) should
// use instead of calling signUp() directly.
export async function signUpAndVerify(page: Page, email: string, password: string = TEST_PASSWORD): Promise<void> {
  await signUp(page, email, password)
  await verifyPhoneForTest(email)
  await page.goto("/profile")
}

// Grants admin_flags.is_admin via the service-role client — mirrors the
// bootstrap insert in supabase/migrations/0014_admin.sql (there is no
// client-facing way to self-promote, by design).
export async function makeAdminForTest(email: string): Promise<void> {
  const admin = createAdminClient()
  const user = await findAuthUserByEmail(admin, email)
  const { error: upsertError } = await admin.from("admin_flags").upsert({ user_id: user.id, is_admin: true })
  if (upsertError) {
    throw upsertError
  }
}

// A minimal valid PNG (1x1 transparent pixel) as a Playwright file payload —
// submitRefundProof/submitSettlementReceipt only check size/mime type (see
// MAX_RECEIPT_BYTES/ALLOWED_RECEIPT_TYPES in src/features/bookings/actions.ts),
// so a real photo isn't needed.
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

export function receiptFilePayload(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64") }
}

// Unlike receiptFilePayload's blank pixel, this renders actual IBAN/amount
// text into a screenshot — for exercising the OCR auto-approval path
// (submit_settlement_receipt_ocr, src/lib/ocr.ts), which needs something a real
// bank app screenshot's text to recognize. Uses a throwaway page in the same
// browser context rather than a separate image library dependency.
export async function realisticReceiptFilePayload(
  page: Page,
  name: string,
  iban: string,
  amount: number
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const scratchPage = await page.context().newPage()
  await scratchPage.setContent(`
    <html><body style="font-family: Arial; font-size: 22px; padding: 20px; width: 500px;">
      <div>Gonderen: E2E Yolcu</div>
      <div>Alici IBAN: ${iban}</div>
      <div>Tutar: ${amount.toFixed(2).replace(".", ",")} TL</div>
      <div>Aciklama: Yolculuk odemesi</div>
    </body></html>
  `)
  const buffer = await scratchPage.screenshot()
  await scratchPage.close()
  return { name, mimeType: "image/png", buffer }
}
