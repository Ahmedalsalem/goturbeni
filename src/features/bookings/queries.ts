import "server-only"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { Booking, BookingWithPassenger, BookingWithRide } from "@/types/booking"

const BOOKING_WITH_RIDE_SELECT = "*, ride:rides(*, driver:profiles(full_name, avatar_url))"
const BOOKING_WITH_PASSENGER_SELECT = "*, passenger:profiles(full_name, avatar_url)"

export async function getMyBookings(passengerId: string): Promise<BookingWithRide[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_RIDE_SELECT)
    .eq("passenger_id", passengerId)
    .order("created_at", { ascending: false })

  return (data as BookingWithRide[] | null) ?? []
}

export async function getRideBookings(rideId: string): Promise<BookingWithPassenger[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_PASSENGER_SELECT)
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true })

  return (data as BookingWithPassenger[] | null) ?? []
}

// Used by bookings/actions.ts to know who to notify after approve/reject —
// the RPCs that perform those mutations return void, so the passenger id
// isn't otherwise available in the action.
export async function getBookingPassengerId(bookingId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("bookings").select("passenger_id").eq("id", bookingId).single()
  return data?.passenger_id ?? null
}

// approveBooking, bir yolcu ilanına verilen teklifi onaylarken teklif veren
// sürücünün IBAN/plaka bilgisini kontrol etmek için bu sürücünün id'sine
// ihtiyaç duyar (bookings.driver_id, sadece booker_role='driver' satırlarında
// dolu) — getBookingPassengerId ile aynı desen.
export async function getBookingDriverId(bookingId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("bookings").select("driver_id").eq("id", bookingId).single()
  return data?.driver_id ?? null
}

// Only the passenger's currently active (pending/approved) booking, if any —
// a past rejected/cancelled booking doesn't block re-booking the same ride
// (see the partial unique index in supabase/migrations/0003_bookings.sql).
export async function getMyBookingForRide(rideId: string, passengerId: string): Promise<Booking | null> {
  if (!isSupabaseConfigured()) {
    return null
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("ride_id", rideId)
    .eq("passenger_id", passengerId)
    .in("status", ["pending", "approved"])
    .maybeSingle()

  return data as Booking | null
}

// Exposes the ride driver's IBAN to the passenger of an active booking on
// that ride, via a security-definer RPC that re-checks the relationship
// server-side (profiles_private is otherwise owner-only, see
// get_ride_driver_payment_info in supabase/migrations/0017_booking_payment_flow.sql).
export async function getRideDriverPaymentInfo(rideId: string): Promise<{ iban: string; iban_holder_name: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_ride_driver_payment_info", { p_ride_id: rideId }).maybeSingle()
  const row = data as { iban: string | null; iban_holder_name: string | null } | null
  if (!row?.iban || !row?.iban_holder_name) {
    return null
  }
  return { iban: row.iban, iban_holder_name: row.iban_holder_name }
}

// Exposes the counterparty's phone number once a booking on this ride is
// approved — profiles_private is otherwise owner-only, see
// get_ride_counterparty_phone in supabase/migrations/0037_ride_counterparty_phone.sql.
// Returns null before approval, if the caller isn't actually a party to an
// approved booking on this ride, or if the phone was never set/verified.
export async function getRideCounterpartyPhone(rideId: string, counterpartId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_ride_counterparty_phone", {
    p_ride_id: rideId,
    p_recipient_id: counterpartId,
  })
  return (data as string | null) ?? null
}

const RECEIPT_SIGNED_URL_TTL_SECONDS = 60 * 5

// payment-receipts is a private bucket (0020_payment_receipts.sql) — bookings
// store the object's storage path, not a public URL, so viewing a receipt
// (booking owner, ride driver, or admin — enforced by the bucket's storage
// policies) needs a short-lived signed URL minted on demand.
export async function getSignedReceiptUrl(path: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from("payment-receipts").createSignedUrl(path, RECEIPT_SIGNED_URL_TTL_SECONDS)
  return data?.signedUrl ?? null
}
