// Scenario 2: deliberate last-seat race — proves/disproves the claim in
// supabase/migrations/0017_booking_payment_flow.sql's approve_booking (the
// current, effective version of the function originally defined in
// 0003_bookings.sql): that locking both the booking row and the ride row
// `for update` before checking `available_seats` serializes concurrent
// approvals, so only one of N simultaneous approve_booking calls for the
// same single remaining seat can ever succeed.
//
// Usage: node loadtest/last-seat-race.mjs [concurrentApprovals]
import { createRideDirect, createPendingBookingDirect, createSignedInUser, getRide } from "./lib/setup.mjs"

const CONCURRENT_APPROVALS = Number(process.argv[2] || process.env.LOAD_TEST_CONCURRENCY || 20)

async function main() {
  console.log(`Last-seat race: ${CONCURRENT_APPROVALS} concurrent approve_booking calls against a ride with 1 seat`)

  const driver = await createSignedInUser("driver")
  const rideId = await createRideDirect({ driverId: driver.userId, seatCount: 1 })

  const passengers = await Promise.all(Array.from({ length: CONCURRENT_APPROVALS }, (_, i) => createSignedInUser(`pax${i}`)))
  const bookingIds = await Promise.all(
    passengers.map((p) => createPendingBookingDirect({ rideId, passengerId: p.userId, seatCount: 1 }))
  )

  console.log(`Ride ${rideId} created with 1 seat, ${bookingIds.length} pending bookings for it. Firing concurrent approvals...`)

  const results = await Promise.allSettled(
    bookingIds.map((bookingId) => driver.client.rpc("approve_booking", { p_booking_id: bookingId }))
  )

  const succeeded = []
  const rejected = []
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && !r.value.error) {
      succeeded.push(bookingIds[i])
    } else {
      const message = r.status === "fulfilled" ? r.value.error?.message : r.reason?.message
      rejected.push({ bookingId: bookingIds[i], message })
    }
  })

  const finalRide = await getRide(rideId)

  console.log(`\nSucceeded: ${succeeded.length}, rejected: ${rejected.length}`)
  console.log(`Rejection reasons: ${[...new Set(rejected.map((r) => r.message))].join(", ")}`)
  console.log(`Final ride.available_seats: ${finalRide.available_seats} (started at 1)`)

  const invariantHeld = succeeded.length === 1 && finalRide.available_seats === 0
  if (invariantHeld) {
    console.log("\nPASS: exactly one approval succeeded, available_seats correctly reached 0. No overbooking observed.")
  } else {
    console.log("\nFAIL: expected exactly 1 success and available_seats=0 — overbooking or a locking regression detected.")
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
