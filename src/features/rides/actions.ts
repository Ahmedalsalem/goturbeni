"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { requireVerifiedProfile, verifySession } from "@/lib/supabase/dal"
import { checkRateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { sendSearchAlertNotifications } from "@/lib/search-alert-notifications"
import { parseIstanbulDateTime } from "@/utils/istanbul-time"
import { buildRideSchema, type RideActionState, type RideFormValues } from "@/features/rides/schemas"
import { TR_PLATE_PATTERN } from "@/features/profile/schemas"

const CREATE_RIDE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 }

async function getRideTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Rides.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Rides.errors" })
  return { schema: buildRideSchema(tValidation), tErrors }
}

// Shared insert/update payload shape for createRide/updateRide. available_seats
// mirrors seat_count on both create and edit — there's no partial-booking
// mechanism yet (see README "Faz 2 Notları"), so the two always stay in sync.
function buildRideRow(parsed: RideFormValues) {
  return {
    departure_city: parsed.departureCity,
    arrival_city: parsed.arrivalCity,
    departure_district: parsed.departureDistrict ?? null,
    arrival_district: parsed.arrivalDistrict ?? null,
    departure_time: parseIstanbulDateTime(parsed.departureDate, parsed.departureTime).toISOString(),
    seat_count: parsed.seatCount,
    available_seats: parsed.seatCount,
    cost_share: parsed.costShare,
    description: parsed.description ?? null,
    pets_allowed: parsed.petsAllowed,
    smoking_allowed: parsed.smokingAllowed,
    vip_solo: parsed.vipSolo,
  }
}

export async function createRide(values: RideFormValues): Promise<RideActionState> {
  const { schema, tErrors } = await getRideTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await requireVerifiedProfile()
  if (!(await checkRateLimit(`create-ride:${user.id}`, CREATE_RIDE_RATE_LIMIT.limit, CREATE_RIDE_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const supabase = await createClient()

  // Sürücü IBAN + hesap sahibi adı olmadan ilan açamaz (bkz. "Yarı-Yarı
  // Ödeme Akışı" — yolcunun ilk yarı ödemesini gönderebilmesi için ilan
  // sahibinin ödeme bilgisi baştan tam olmalı).
  const { data: paymentInfo } = await supabase.from("profiles_private").select("iban, iban_holder_name").eq("id", user.id).maybeSingle()
  if (!paymentInfo?.iban || !paymentInfo?.iban_holder_name) {
    return { error: tErrors("ibanRequired") }
  }

  // Sürücü geçerli formatta bir plaka olmadan ilan açamaz — yolcunun aracı
  // teşhis edebilmesi (bkz. 0050_car_plate.sql) artık zorunlu, IBAN kontrolüyle
  // aynı desende. profiles.car_plate serbest yazılmış olabilir (eski kayıtlar),
  // bu yüzden format burada da doğrulanır, sadece boş olmadığı değil.
  const { data: driverProfile } = await supabase.from("profiles").select("car_plate").eq("id", user.id).maybeSingle()
  if (!driverProfile?.car_plate || !TR_PLATE_PATTERN.test(driverProfile.car_plate)) {
    return { error: tErrors("carPlateRequired") }
  }

  const { data: ride, error } = await supabase
    .from("rides")
    .insert({ driver_id: user.id, posted_by_role: "driver", posted_by: user.id, ...buildRideRow(parsed.data) })
    .select("id")
    .single()

  if (error) {
    logError(error, "rides.createRide")
    return { error: tErrors("createFailed") }
  }

  if (parsed.data.repeatWeekly) {
    await createRideSeriesForRide(ride.id, user.id, parsed.data)
  }

  await sendSearchAlertNotifications(ride.id)

  redirect("/rides/mine")
}

// The series' weekday/time-of-day come straight from this first ride's own
// departureDate/departureTime — there's no separate recurrence field, so the
// occurrence the driver just created *is* the pattern. A failure here (rare
// — malformed date string) shouldn't take down ride creation itself, since
// the ride the driver actually asked for was already created successfully.
async function createRideSeriesForRide(rideId: string, driverId: string, parsed: RideFormValues): Promise<void> {
  const supabase = await createClient()
  const weekday = new Date(`${parsed.departureDate}T00:00:00Z`).getUTCDay()

  const { data: series, error } = await supabase
    .from("ride_series")
    .insert({
      driver_id: driverId,
      departure_city: parsed.departureCity,
      arrival_city: parsed.arrivalCity,
      departure_district: parsed.departureDistrict ?? null,
      arrival_district: parsed.arrivalDistrict ?? null,
      weekday,
      departure_time_of_day: parsed.departureTime,
      seat_count: parsed.seatCount,
      cost_share: parsed.costShare,
      description: parsed.description ?? null,
      pets_allowed: parsed.petsAllowed,
      smoking_allowed: parsed.smokingAllowed,
      vip_solo: parsed.vipSolo,
    })
    .select("id")
    .single()

  if (error || !series) {
    logError(error ?? new Error("no series row returned"), "rides.createRideSeriesForRide")
    return
  }

  const { error: linkError } = await supabase.from("rides").update({ series_id: series.id }).eq("id", rideId)
  if (linkError) {
    logError(linkError, "rides.createRideSeriesForRide.link")
    // The series row exists but isn't linked to any ride — generate_recurring_rides
    // (0039_ride_series.sql) de-dupes by matching series_id on existing rides,
    // so an unlinked-but-active series would generate a DUPLICATE of the
    // occurrence the driver already has. Deactivating it immediately (same
    // "update own ride series" policy pauseRideSeries uses) prevents that;
    // the driver can always turn "repeat weekly" on again from a future ride.
    await supabase.from("ride_series").update({ is_active: false }).eq("id", series.id)
  }
}

export async function updateRide(rideId: string, values: RideFormValues): Promise<RideActionState> {
  const { schema, tErrors } = await getRideTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rides")
    .update(buildRideRow(parsed.data))
    .eq("id", rideId)
    .eq("posted_by", user.id)
    .eq("status", "active")

  if (error) {
    logError(error, "rides.updateRide")
    return { error: tErrors("updateFailed") }
  }

  redirect("/rides/mine")
}

export async function cancelRide(rideId: string): Promise<RideActionState> {
  const locale = await getUserLocale()
  const tErrors = await getTranslations({ locale, namespace: "Rides.errors" })
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()

  // cancel_ride_with_bookings also cascades to that ride's bookings — any
  // booking whose deposit was already confirmed/settled flips into the
  // refund workflow (refund_status='pending') instead of just disappearing;
  // see supabase/migrations/0021_cancellation_refunds.sql.
  const { error } = await supabase.rpc("cancel_ride_with_bookings", { p_ride_id: rideId })

  if (error) {
    logError(error, "rides.cancelRide")
    return { error: tErrors("cancelFailed") }
  }

  revalidatePath("/rides/mine")
  revalidatePath("/bookings")
  return { success: true }
}

// Stops future auto-generated occurrences (see generate_recurring_rides,
// 0039_ride_series.sql) — does not touch any ride already created from this
// series, matching/matches cancelRide's own single-occurrence scope.
export async function pauseRideSeries(seriesId: string): Promise<RideActionState> {
  const locale = await getUserLocale()
  const tErrors = await getTranslations({ locale, namespace: "Rides.errors" })
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("ride_series").update({ is_active: false }).eq("id", seriesId).eq("driver_id", user.id)

  if (error) {
    logError(error, "rides.pauseRideSeries")
    return { error: tErrors("pauseFailed") }
  }

  revalidatePath("/rides/mine")
  return { success: true }
}
