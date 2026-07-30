// Test-data helpers for the load test scripts. Mirrors the bypass pattern
// e2e/utils.ts already uses (service-role client, direct table writes) but
// skips the UI entirely (signUp/createRide via Playwright) — driving 50-100
// virtual users through real browser forms isn't what's being measured here,
// and phone OTP/email verification can't be completed headlessly anyway (see
// e2e/utils.ts's verifyPhoneForTest comment). None of the RPCs under test
// (approve_booking/cancel_booking) check phone_verified or IBAN — those are
// app-layer guards in src/features/*/actions.ts, not DB constraints — so
// bypassing the UI here does not change what's being exercised in the RPCs.
import { createClient } from "@supabase/supabase-js"

import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./config.mjs"

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

let userCounter = 0
export function uniqueEmail(prefix) {
  userCounter += 1
  return `loadtest-${prefix}-${Date.now()}-${userCounter}@example.com`
}

const PASSWORD = "LoadTest1234!"

// Creates a fully confirmed auth user (no email/OTP round trip) and returns
// a signed-in client for them, ready to call RPCs as that user (auth.uid()
// resolves correctly since this is a real anon-key + password session, not
// the service-role client).
export async function createSignedInUser(prefix) {
  const admin = adminClient()
  const email = uniqueEmail(prefix)
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`)
  const userId = data.user.id

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`signIn(${email}) failed: ${signInError.message}`)

  return { client, userId, email }
}

// Inserts a ride directly (service role bypasses RLS + the app-layer IBAN
// guard in createRide, see comment above) — departure_time far enough in the
// future that 0011_ride_auto_complete.sql's cron job won't flip it to
// 'completed' mid-test.
export async function createRideDirect({ driverId, departureCity = "İzmir", arrivalCity = "Antalya", seatCount = 1, costShare = 50 }) {
  const admin = adminClient()
  const departureTime = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from("rides")
    .insert({
      driver_id: driverId,
      departure_city: departureCity,
      arrival_city: arrivalCity,
      departure_time: departureTime,
      seat_count: seatCount,
      available_seats: seatCount,
      cost_share: costShare,
    })
    .select("id")
    .single()
  if (error) throw new Error(`createRideDirect failed: ${error.message}`)
  return data.id
}

export async function createPendingBookingDirect({ rideId, passengerId, seatCount = 1 }) {
  const admin = adminClient()
  const { data, error } = await admin
    .from("bookings")
    .insert({ ride_id: rideId, passenger_id: passengerId, seat_count: seatCount, status: "pending" })
    .select("id")
    .single()
  if (error) throw new Error(`createPendingBookingDirect failed: ${error.message}`)
  return data.id
}

export async function getRide(rideId) {
  const admin = adminClient()
  const { data, error } = await admin.from("rides").select("*").eq("id", rideId).single()
  if (error) throw new Error(`getRide failed: ${error.message}`)
  return data
}

export async function getBooking(bookingId) {
  const admin = adminClient()
  const { data, error } = await admin.from("bookings").select("*").eq("id", bookingId).single()
  if (error) throw new Error(`getBooking failed: ${error.message}`)
  return data
}
