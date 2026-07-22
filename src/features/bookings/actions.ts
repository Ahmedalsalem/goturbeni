"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { checkRateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { getRide } from "@/features/rides/queries"
import { getBookingPassengerId } from "@/features/bookings/queries"
import { sendPushNotification } from "@/lib/notifications"
import { buildBookingSchema, type BookingActionState, type BookingFormValues } from "@/features/bookings/schemas"

const CREATE_BOOKING_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 }

async function getBookingTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Bookings.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Bookings.errors" })
  return { schema: buildBookingSchema(tValidation), tErrors }
}

export async function createBooking(rideId: string, values: BookingFormValues): Promise<BookingActionState> {
  const { schema, tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  if (!checkRateLimit(`create-booking:${user.id}`, CREATE_BOOKING_RATE_LIMIT.limit, CREATE_BOOKING_RATE_LIMIT.windowMs)) {
    return { error: tErrors("tooManyRequests") }
  }

  const ride = await getRide(rideId)
  if (!ride || ride.status !== "active") {
    return { error: tErrors("rideNotActive") }
  }
  if (ride.driver_id === user.id) {
    return { error: tErrors("ownRide") }
  }
  if (parsed.data.seatCount > ride.available_seats) {
    return { error: tErrors("notEnoughSeats") }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("bookings").insert({
    ride_id: rideId,
    passenger_id: user.id,
    seat_count: parsed.data.seatCount,
  })

  if (error) {
    // 23505 = unique_violation — the partial unique index on (ride_id,
    // passenger_id) where status in (pending, approved).
    if (error.code !== "23505") {
      logError(error, "bookings.createBooking")
    }
    return { error: error.code === "23505" ? tErrors("alreadyBooked") : tErrors("createFailed") }
  }

  await sendPushNotification({ type: "booking_requested", recipientId: ride.driver_id, rideId })

  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

export async function approveBooking(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("approve_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.approveBooking")
    return { error: error.message.includes("not_enough_seats") ? tErrors("notEnoughSeats") : tErrors("approveFailed") }
  }

  const passengerId = await getBookingPassengerId(bookingId)
  if (passengerId) {
    await sendPushNotification({ type: "booking_approved", recipientId: passengerId, rideId })
  }

  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

export async function rejectBooking(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("reject_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.rejectBooking")
    return { error: tErrors("rejectFailed") }
  }

  const passengerId = await getBookingPassengerId(bookingId)
  if (passengerId) {
    await sendPushNotification({ type: "booking_rejected", recipientId: passengerId, rideId })
  }

  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}

export async function cancelBooking(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.cancelBooking")
    return { error: tErrors("cancelFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}
