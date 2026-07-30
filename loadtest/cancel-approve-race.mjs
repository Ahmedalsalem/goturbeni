// Scenario 3: probes the specific gap flagged in the concurrency audit —
// cancel_booking (currently defined in supabase/migrations/0041_no_show_and_
// late_cancellation.sql, same rides-update shape since 0003_bookings.sql)
// credits a seat back with a bare `update rides set available_seats =
// available_seats + n where id = ...`, without first taking an explicit
// `select ... for update` lock on the rides row the way approve_booking
// does. This fires cancel_booking (crediting a seat) and approve_booking
// (consuming a seat) at the same instant, many times, and checks the
// invariant `available_seats + sum(approved seats) == seat_count` holds
// after every single interleaving — a genuine lost update would eventually
// show up as available_seats going negative, above seat_count, or
// inconsistent with the booking rows' actual statuses.
//
// Usage: node loadtest/cancel-approve-race.mjs [iterations]
import { createRideDirect, createPendingBookingDirect, createSignedInUser, getRide, getBooking } from "./lib/setup.mjs"

const ITERATIONS = Number(process.argv[2] || process.env.LOAD_TEST_ITERATIONS || 30)

async function runIteration(i) {
  const driver = await createSignedInUser(`driver${i}`)
  const passengerA = await createSignedInUser(`paxA${i}`)
  const passengerC = await createSignedInUser(`paxC${i}`)

  // 2-seat ride: A takes 1 seat (approved), C is pending for the last seat.
  const rideId = await createRideDirect({ driverId: driver.userId, seatCount: 2 })
  const bookingA = await createPendingBookingDirect({ rideId, passengerId: passengerA.userId, seatCount: 1 })
  const bookingC = await createPendingBookingDirect({ rideId, passengerId: passengerC.userId, seatCount: 1 })

  const approveA = await driver.client.rpc("approve_booking", { p_booking_id: bookingA })
  if (approveA.error) throw new Error(`setup: approving A failed: ${approveA.error.message}`)

  // At this point: available_seats=1, A approved, C still pending. Fire the
  // race: A cancels (should credit 1 seat back) at the same instant the
  // driver approves C (should consume 1 seat) — same starting count (1) on
  // both sides, so whichever RPC's `select ... for update` (approve) or bare
  // `update` (cancel) lands first genuinely matters for the interleaving.
  const [cancelResult, approveResult] = await Promise.allSettled([
    passengerA.client.rpc("cancel_booking", { p_booking_id: bookingA }),
    driver.client.rpc("approve_booking", { p_booking_id: bookingC }),
  ])

  const finalRide = await getRide(rideId)
  const finalBookingA = await getBooking(bookingA)
  const finalBookingC = await getBooking(bookingC)

  const approvedSeats = [finalBookingA, finalBookingC]
    .filter((b) => b.status === "approved")
    .reduce((sum, b) => sum + b.seat_count, 0)

  const invariantHeld = finalRide.available_seats >= 0 && finalRide.available_seats <= finalRide.seat_count && finalRide.available_seats + approvedSeats === finalRide.seat_count

  return {
    iteration: i,
    cancelOk: cancelResult.status === "fulfilled" && !cancelResult.value.error,
    cancelError: cancelResult.status === "fulfilled" ? cancelResult.value.error?.message : cancelResult.reason?.message,
    approveOk: approveResult.status === "fulfilled" && !approveResult.value.error,
    approveError: approveResult.status === "fulfilled" ? approveResult.value.error?.message : approveResult.reason?.message,
    availableSeats: finalRide.available_seats,
    seatCount: finalRide.seat_count,
    bookingAStatus: finalBookingA.status,
    bookingCStatus: finalBookingC.status,
    invariantHeld,
  }
}

async function main() {
  console.log(`Cancel/approve race: ${ITERATIONS} iterations of concurrent cancel_booking + approve_booking on the same ride`)

  const outcomes = []
  for (let i = 0; i < ITERATIONS; i++) {
    outcomes.push(await runIteration(i))
  }

  const violations = outcomes.filter((o) => !o.invariantHeld)
  const byOrdering = outcomes.reduce((acc, o) => {
    const key = `cancel=${o.cancelOk ? "ok" : "fail"},approve=${o.approveOk ? "ok" : "fail"}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  console.log("\nOutcome distribution (which side won each race):", byOrdering)

  if (violations.length > 0) {
    console.log(`\nFAIL: ${violations.length}/${ITERATIONS} iterations violated the seat-count invariant:`)
    for (const v of violations) {
      console.log(
        `  iteration ${v.iteration}: available_seats=${v.availableSeats}/${v.seatCount}, bookingA=${v.bookingAStatus}, bookingC=${v.bookingCStatus}`
      )
    }
    process.exitCode = 1
  } else {
    console.log(`\nPASS: all ${ITERATIONS} iterations kept available_seats consistent with actual approved bookings. No lost update observed.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
