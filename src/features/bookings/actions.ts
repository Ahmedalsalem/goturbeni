"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { getRide } from "@/features/rides/queries"
import { buildBookingSchema, type BookingActionState, type BookingFormValues } from "@/features/bookings/schemas"

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
    return { error: error.code === "23505" ? tErrors("alreadyBooked") : tErrors("createFailed") }
  }

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
    return { error: error.message.includes("not_enough_seats") ? tErrors("notEnoughSeats") : tErrors("approveFailed") }
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
    return { error: tErrors("rejectFailed") }
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
    return { error: tErrors("cancelFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}
