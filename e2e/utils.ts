import { type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

export const TEST_PASSWORD = "Test1234!"

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`
}

export async function signUp(page: Page, email: string, password: string = TEST_PASSWORD): Promise<void> {
  await page.goto("/register")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.locator("#confirmPassword").fill(password)
  await page.getByRole("button", { name: "Hesap Oluştur" }).click()
  await page.waitForURL("**/profile")
}

export async function logIn(page: Page, email: string, password: string = TEST_PASSWORD): Promise<void> {
  await page.goto("/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Giriş Yap" }).click()
  await page.waitForURL("**/profile")
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
  options: { departureCity: string; arrivalCity: string; minutesAhead: number; seatCount: number; costShare: number }
): Promise<string> {
  await page.goto("/create-ride")
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
