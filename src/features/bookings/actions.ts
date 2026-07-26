"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { requireVerifiedProfile, verifySession } from "@/lib/supabase/dal"
import { checkRateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { getRide } from "@/features/rides/queries"
import { getBookingPassengerId } from "@/features/bookings/queries"
import { sendPushNotification } from "@/lib/notifications"
import { sendEmailNotification } from "@/lib/email"
import { buildBookingSchema, type BookingActionState, type BookingFormValues } from "@/features/bookings/schemas"

const CREATE_BOOKING_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 }
const RECEIPT_UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 }
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
const ALLOWED_RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"]

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

  const user = await requireVerifiedProfile()
  if (!(await checkRateLimit(`create-booking:${user.id}`, CREATE_BOOKING_RATE_LIMIT.limit, CREATE_BOOKING_RATE_LIMIT.windowMs))) {
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

  await Promise.all([
    sendPushNotification({ type: "booking_requested", recipientId: ride.driver_id, rideId }),
    sendEmailNotification({ type: "booking_requested", recipientId: ride.driver_id, rideId }),
  ])

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
    await Promise.all([
      sendPushNotification({ type: "booking_approved", recipientId: passengerId, rideId }),
      sendEmailNotification({ type: "booking_approved", recipientId: passengerId, rideId }),
    ])
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
    await Promise.all([
      sendPushNotification({ type: "booking_rejected", recipientId: passengerId, rideId }),
      sendEmailNotification({ type: "booking_rejected", recipientId: passengerId, rideId }),
    ])
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

// Either party's "Kalan Ödeme Tamamlandı" confirmation, post-trip. The RPC
// figures out which side the caller is (driver vs passenger) and only flips
// payment_status to 'settled' once both have confirmed — see
// confirm_remaining_payment in supabase/migrations/0017_booking_payment_flow.sql.
export async function confirmRemainingPayment(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("confirm_remaining_payment", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.confirmRemainingPayment")
    return { error: tErrors("settleFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}

// Shared upload helper for both the passenger's deposit receipt and the
// driver's refund proof — same private bucket, same file constraints, only
// the destination path prefix and the follow-up RPC differ.
async function uploadReceiptFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  kind: "deposit" | "refund" | "settlement",
  file: File
): Promise<{ path: string } | { error: string }> {
  const tErrors = (await getBookingTranslators()).tErrors
  if (file.size > MAX_RECEIPT_BYTES) {
    return { error: tErrors("receiptTooLarge") }
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
    return { error: tErrors("receiptInvalidType") }
  }

  const extension = file.type.split("/")[1]
  const path = `${bookingId}/${kind}-${Date.now()}.${extension}`
  const { error } = await supabase.storage.from("payment-receipts").upload(path, file, { contentType: file.type })
  if (error) {
    logError(error, `bookings.uploadReceiptFile.${kind}`)
    return { error: tErrors("receiptUploadFailed") }
  }
  return { path }
}

// Passenger uploads proof of the IBAN deposit transfer — reviewed by the
// driver informally and, ultimately, by an admin (admin_review_deposit_receipt
// in supabase/migrations/0020_payment_receipts.sql).
export async function submitDepositReceipt(bookingId: string, rideId: string, formData: FormData): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const file = formData.get("receipt")
  if (!(file instanceof File) || file.size === 0) {
    return { error: tErrors("receiptRequired") }
  }

  const user = await verifySession()
  if (!(await checkRateLimit(`submit-receipt:${user.id}`, RECEIPT_UPLOAD_RATE_LIMIT.limit, RECEIPT_UPLOAD_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }
  const supabase = await createClient()

  const uploaded = await uploadReceiptFile(supabase, bookingId, "deposit", file)
  if ("error" in uploaded) {
    return uploaded
  }

  const { error } = await supabase.rpc("submit_deposit_receipt", { p_booking_id: bookingId, p_receipt_url: uploaded.path })
  if (error) {
    logError(error, "bookings.submitDepositReceipt")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}`)
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}

// Driver uploads proof that a refund was sent back to the passenger, after
// cancel_ride_with_bookings flagged the booking as refund_status='pending'
// (see supabase/migrations/0021_cancellation_refunds.sql).
export async function submitRefundProof(bookingId: string, rideId: string, formData: FormData): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const file = formData.get("receipt")
  if (!(file instanceof File) || file.size === 0) {
    return { error: tErrors("receiptRequired") }
  }

  const user = await verifySession()
  if (!(await checkRateLimit(`submit-receipt:${user.id}`, RECEIPT_UPLOAD_RATE_LIMIT.limit, RECEIPT_UPLOAD_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }
  const supabase = await createClient()

  const uploaded = await uploadReceiptFile(supabase, bookingId, "refund", file)
  if ("error" in uploaded) {
    return uploaded
  }

  const { error } = await supabase.rpc("submit_refund_proof", { p_booking_id: bookingId, p_receipt_url: uploaded.path })
  if (error) {
    logError(error, "bookings.submitRefundProof")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

// Passenger uploads proof of the post-trip remaining-half IBAN transfer —
// same evidence-layer pattern as submitDepositReceipt, reviewed by an admin
// (admin_review_settlement_receipt in supabase/migrations/0025). This is
// independent of confirmRemainingPayment's mutual "I received it" buttons —
// both can be used together.
export async function submitSettlementReceipt(bookingId: string, rideId: string, formData: FormData): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const file = formData.get("receipt")
  if (!(file instanceof File) || file.size === 0) {
    return { error: tErrors("receiptRequired") }
  }

  const user = await verifySession()
  if (!(await checkRateLimit(`submit-receipt:${user.id}`, RECEIPT_UPLOAD_RATE_LIMIT.limit, RECEIPT_UPLOAD_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }
  const supabase = await createClient()

  const uploaded = await uploadReceiptFile(supabase, bookingId, "settlement", file)
  if ("error" in uploaded) {
    return uploaded
  }

  const { error } = await supabase.rpc("submit_settlement_receipt", { p_booking_id: bookingId, p_receipt_url: uploaded.path })
  if (error) {
    logError(error, "bookings.submitSettlementReceipt")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}
