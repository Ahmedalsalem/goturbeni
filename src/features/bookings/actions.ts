"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { requireVerifiedProfile, verifySession } from "@/lib/supabase/dal"
import { checkRateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { getRide } from "@/features/rides/queries"
import { getBookingParties } from "@/features/bookings/queries"
import { extractReceiptFields } from "@/lib/ocr"
import { recordNotificationEvent, sendPushNotification, sendSeatOpenedPushNotifications } from "@/lib/notifications"
import { sendEmailNotification, sendSeatOpenedEmailNotifications } from "@/lib/email"
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
  if (!ride.driver_id) {
    // Defensive: a passenger-posted ride (posted_by_role='passenger') has no
    // driver_id until a driver's offer is approved — the "insert own ride"
    // RLS policy (requires auth.uid() = driver_id at insert time for
    // posted_by_role='driver') plus the revoke on client UPDATEs of driver_id
    // (0058) guarantee a driver-posted ride always has one, so this should be
    // unreachable via that path (the rides_posted_by_matches_driver_when_
    // driver_posted CHECK constraint does NOT by itself enforce this — SQL's
    // NULL-passes-CHECK semantics mean it doesn't reject driver_id IS NULL).
    // There's no "request a seat" flow for a passenger-posted ride yet
    // (that's a driver making an offer, a separate not-yet-built action), so
    // this just fails closed rather than sending a notification to a
    // non-existent recipient.
    logError(new Error("createBooking: ride has no driver_id"), "bookings.createBooking")
    return { error: tErrors("createFailed") }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_booking", { p_ride_id: rideId, p_seat_count: parsed.data.seatCount })

  if (error) {
    // 23505 = unique_violation — the partial unique index on (ride_id,
    // passenger_id) where status in (pending, approved). Other messages are
    // create_booking's own raised exceptions (0065_instant_booking.sql) —
    // ride_not_active/own_ride/not_enough_seats duplicate the client-side
    // guard clauses above for the common case, but the RPC is the actual
    // source of truth (atomic, `for update`-locked) since two concurrent
    // requests can both pass the client-side checks.
    if (error.code === "23505") {
      return { error: tErrors("alreadyBooked") }
    }
    if (error.message.includes("not_enough_seats")) {
      return { error: tErrors("notEnoughSeats") }
    }
    logError(error, "bookings.createBooking")
    return { error: tErrors("createFailed") }
  }

  await Promise.all([
    sendPushNotification({ type: "booking_requested", recipientId: ride.driver_id, rideId }),
    sendEmailNotification({ type: "booking_requested", recipientId: ride.driver_id, rideId }),
    recordNotificationEvent({ type: "booking_requested", recipientId: ride.driver_id, rideId }),
  ])

  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

// createBooking'in "ters" versiyonu — bir sürücü, bir yolcu ilanına teklif
// verir. seat_count kullanıcıdan alınmaz: bir yolcu ilanı tek bir sürücü
// tarafından TAM karşılanır (kısmi teklif yok, bkz. tasarım dokümanı),
// dolayısıyla her zaman ride.seat_count kadar. IBAN/plaka kontrolü burada
// YAPILMAZ — approveBooking'e taşındı (ilan sahibi onaylayana kadar hangi
// sürücünün teklifinin kabul edileceği belli değil).
export async function createOffer(rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const user = await requireVerifiedProfile()
  if (!(await checkRateLimit(`create-offer:${user.id}`, CREATE_BOOKING_RATE_LIMIT.limit, CREATE_BOOKING_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const ride = await getRide(rideId)
  if (!ride || ride.status !== "active") {
    return { error: tErrors("rideNotActive") }
  }
  if (ride.posted_by_role !== "passenger") {
    return { error: tErrors("notPassengerListing") }
  }
  if (ride.posted_by === user.id) {
    return { error: tErrors("ownRide") }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("bookings").insert({
    ride_id: rideId,
    passenger_id: ride.posted_by,
    booker_role: "driver",
    driver_id: user.id,
    seat_count: ride.seat_count,
  })

  if (error) {
    // 23505 = unique_violation — Task 2'nin bookings_one_active_offer_per_driver_ride'ı.
    if (error.code !== "23505") {
      logError(error, "bookings.createOffer")
    }
    return { error: error.code === "23505" ? tErrors("alreadyOffered") : tErrors("createFailed") }
  }

  await Promise.all([
    sendPushNotification({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
    sendEmailNotification({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
    recordNotificationEvent({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
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

  // Yolcu ilanına verilen bir teklif onaylanıyorsa, teklif veren sürücünün
  // IBAN + plaka bilgisi burada kontrol edilir — sürücü ilanında bu kontrol
  // createRide'da (ilan açılırken) yapılıyordu; yolcu ilanında henüz bir
  // sürücü atanmadığından kontrol onay anına kayıyor (bkz. tasarım
  // dokümanı "Ödeme akışı sıralaması"). Ride, bookingId'nin gerçek
  // ride_id'sinden çekiliyor — ayrıca geçirilen rideId parametresine
  // güvenilmiyor, çünkü onunla bookingId arasındaki eşleşmeyi hiçbir şey
  // zorunlu kılmıyor (uyuşmayan bir rideId bu kontrolü atlatabilirdi).
  // ride_id/driver_id/passenger_id tek bir getBookingParties okumasıyla
  // birlikte çekiliyor — hem ride'ı çözmek + IBAN/plaka kontrolü için, hem
  // de aşağıda bildirim alıcısını belirlemek için; driver_id RPC'den önce
  // ve sonra ayrı ayrı sorgulanmıyor artık (approve_booking sadece
  // status/payment_status yazıyor, driver_id'yi hiç değiştirmiyor — bkz.
  // _apply_booking_approval, 0059_passenger_listings_approve_reject.sql).
  //
  // IBAN/plaka kontrolü get_offer_driver_readiness RPC'si üzerinden yapılıyor
  // (0063_offer_driver_readiness_rpc.sql) — profiles_private yalnızca
  // SAHİBİ tarafından okunabildiğinden (0006), ilan sahibinin (burada
  // çağıran, yolcu) kendi client'ıyla doğrudan
  // `.from("profiles_private").select(...).eq("id", offeringDriverId)`
  // sorgulaması RLS tarafından her zaman sıfır satır döndürüyordu — sürücü
  // IBAN'ını gerçekten doldursa bile approveBooking onu hep "eksik" sayıp
  // reddediyordu, bu yüzden bir yolcu ilanına verilen hiçbir teklif hiçbir
  // zaman onaylanamıyordu. Bu, ilk kez Playwright'ın CI'da gerçekten canlı
  // çalıştırılmasıyla ortaya çıktı.
  const parties = await getBookingParties(bookingId)
  const ride = parties ? await getRide(parties.rideId) : null
  if (ride?.posted_by_role === "passenger") {
    const offeringDriverId = parties?.driverId ?? null
    if (offeringDriverId) {
      const { data } = await supabase.rpc("get_offer_driver_readiness", { p_booking_id: bookingId }).maybeSingle()
      const readiness = data as { iban_ok: boolean; plate_ok: boolean } | null
      if (!readiness?.iban_ok) {
        return { error: tErrors("offerDriverIbanRequired") }
      }
      if (!readiness?.plate_ok) {
        return { error: tErrors("offerDriverCarPlateRequired") }
      }
    }
  }

  const { error } = await supabase.rpc("approve_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.approveBooking")
    return { error: error.message.includes("not_enough_seats") ? tErrors("notEnoughSeats") : tErrors("approveFailed") }
  }

  // Bir yolcu ilanına verilen teklif onaylanıyorsa bildirim, onay işlemini
  // BİZZAT YAPAN ilan sahibine (passenger_id) değil, sonucu öğrenmesi
  // gereken teklif veren sürücüye (driver_id) gitmeli — driver_id yukarıdaki
  // parties okumasından zaten elde edildi, burada tekrar sorgulanmıyor.
  const recipientId = ride?.posted_by_role === "passenger" ? (parties?.driverId ?? null) : (parties?.passengerId ?? null)
  if (recipientId) {
    // Bildirim gönderimi (push/email/notification-event) yanıtı bloke
    // etmesin diye after() içine alındı — bu dosyanın submitSettlementReceipt'te
    // zaten kullandığı desen.
    after(async () => {
      try {
        await Promise.all([
          sendPushNotification({ type: "booking_approved", recipientId, rideId }),
          sendEmailNotification({ type: "booking_approved", recipientId, rideId }),
          recordNotificationEvent({ type: "booking_approved", recipientId, rideId }),
        ])
      } catch (error) {
        logError(error, "bookings.approveBooking.notify")
      }
    })
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

  // approveBooking ile aynı mantık — reddedilen bir yolcu-ilanı teklifinde
  // bildirim, reddi yapan ilan sahibine değil, teklif veren sürücüye
  // gitmeli. ride_id/driver_id/passenger_id tek bir getBookingParties
  // okumasıyla birlikte çekiliyor (approveBooking'deki gibi).
  const parties = await getBookingParties(bookingId)
  const ride = parties ? await getRide(parties.rideId) : null
  const recipientId = ride?.posted_by_role === "passenger" ? (parties?.driverId ?? null) : (parties?.passengerId ?? null)
  if (recipientId) {
    // approveBooking'deki gibi — yanıtı bloke etmesin diye after() içinde.
    after(async () => {
      try {
        await Promise.all([
          sendPushNotification({ type: "booking_rejected", recipientId, rideId }),
          sendEmailNotification({ type: "booking_rejected", recipientId, rideId }),
          recordNotificationEvent({ type: "booking_rejected", recipientId, rideId }),
        ])
      } catch (error) {
        logError(error, "bookings.rejectBooking.notify")
      }
    })
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

  // cancel_booking (0040/0041) returns whether the cancelled booking was
  // actually 'approved' (i.e. a seat was genuinely held and just freed) —
  // computed inside the same row-locked transaction that flips the status,
  // so there's no separate pre-read racing a concurrent approveBooking.
  const { data: seatFreed, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.cancelBooking")
    return { error: tErrors("cancelFailed") }
  }

  if (seatFreed) {
    await Promise.all([sendSeatOpenedPushNotifications(rideId), sendSeatOpenedEmailNotifications(rideId)])
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

// Either party's "Ödeme Tamamlandı" confirmation, post-trip. The RPC
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
    return { error: error.message.includes("driver_no_show") ? tErrors("driverNoShow") : tErrors("settleFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}

// Shared upload helper for both the driver's refund proof and the
// passenger's settlement receipt — same private bucket, same file
// constraints, only the destination path prefix and the follow-up RPC differ.
async function uploadReceiptFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  kind: "refund" | "settlement",
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

// Passenger uploads proof of the post-trip full-fare IBAN transfer —
// same evidence-layer pattern as submitRefundProof above (upload + admin
// review), reviewed by an admin (admin_review_settlement_receipt in
// supabase/migrations/0025). This is independent of confirmRemainingPayment's
// mutual "I received it" buttons — both can be used together.
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
    return { error: error.message.includes("driver_no_show") ? tErrors("driverNoShow") : tErrors("actionFailed") }
  }

  // OCR-verify-in-the-background approach, running after() once the response
  // has already gone back to the client (see 0054_settlement_ocr_auto_approval.sql)
  // — a match here confirms both parties' "I sent it"/"I received it" at
  // once, since a receipt showing the right IBAN and amount already is the
  // passenger's proof of sending it.
  const receiptBuffer = Buffer.from(await file.arrayBuffer())
  after(async () => {
    try {
      const { iban, amounts } = await extractReceiptFields(receiptBuffer)
      const { error: ocrError } = await supabase.rpc("submit_settlement_receipt_ocr", {
        p_booking_id: bookingId,
        p_iban: iban,
        p_amounts: amounts,
      })
      if (ocrError) {
        logError(ocrError, "bookings.submitSettlementReceipt.ocr")
        return
      }
      revalidatePath("/bookings")
      revalidatePath(`/rides/${rideId}/bookings`)
    } catch (ocrException) {
      logError(ocrException, "bookings.submitSettlementReceipt.ocr")
    }
  })

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}

// Either party reports the other as a no-show, post-trip — report_no_show
// (0041_no_show_and_late_cancellation.sql) figures out which flag to set
// (passenger_no_show vs driver_no_show) from whether the caller is the
// ride's driver or the booking's passenger, and only allows it once the
// ride has actually departed. Feeds the suspicious-account rules an admin
// sees (0042_suspicious_accounts_no_show_rules.sql) — no other user-facing
// effect (no auto-suspension, no visible counter on the counterparty yet).
export async function reportNoShow(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("report_no_show", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.reportNoShow")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}
