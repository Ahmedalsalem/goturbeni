import "server-only"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { Booking, BookingWithPassenger, BookingWithRide } from "@/types/booking"

const BOOKING_WITH_RIDE_SELECT = "*, ride:rides(*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url))"
const BOOKING_WITH_PASSENGER_SELECT =
  "*, passenger:profiles!bookings_passenger_id_fkey(full_name, avatar_url), driver:profiles!bookings_driver_id_fkey(full_name, avatar_url)"

// Faz 2B final review Finding 1 düzeltmesi: booker_role='passenger' filtresi
// olmadan bu sorgu, bir yolcu ilanına gelen HER sürücü teklifini de
// döndürürdü (bu tekliflerde de passenger_id = ilan sahibi) — ilan sahibinin
// kendi /bookings sayfasında, kendi gerçek rezervasyonlarından ayırt
// edilemeyen ve CancelBookingButton'ı her zaman not_booking_owner ile
// başarısız olan sahte "booking" kartları olarak sızardı. Gelen teklifler
// ilan sahibi için /rides/[id]/bookings üzerinden yönetilir (onay/red/chat/
// settle/review/no-show hepsi orada), driver tarafı için getMyDriverOffers
// üzerinden — bu ikisi zaten var, booker_role='driver' satırları burada hiç
// dönmez.
export async function getMyBookings(passengerId: string): Promise<BookingWithRide[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_RIDE_SELECT)
    .eq("passenger_id", passengerId)
    .eq("booker_role", "passenger")
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

// approveBooking/rejectBooking need ride_id + driver_id + passenger_id
// together (to resolve the ride, the offering driver for the IBAN/plate
// check, and the notification recipient) — one row read instead of two or
// three separate single-column selects on the same booking.
export async function getBookingParties(bookingId: string): Promise<{ rideId: string; driverId: string | null; passengerId: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("bookings").select("ride_id, driver_id, passenger_id").eq("id", bookingId).single()
  if (!data) return null
  return { rideId: data.ride_id, driverId: data.driver_id, passengerId: data.passenger_id }
}

// Only the passenger's currently active (pending/approved) booking, if any —
// a past rejected/cancelled booking doesn't block re-booking the same ride
// (see the partial unique index in supabase/migrations/0003_bookings.sql).
//
// Faz 2B final review Finding 2 düzeltmesi: bir yolcu ilanında, ilana
// verilen HER sürücü teklifinin passenger_id'si de ilan sahibiyle aynıdır
// (bkz. getMyBookings'teki not) — booker_role='passenger,approved' ikilisi
// üzerindeki partial unique index (0061) yalnızca booker_role='passenger'
// satırlarını kapsadığından, aynı ilana birden fazla sürücü aynı anda teklif
// verebilir (biri onaylı, kalanı hâlâ pending). Bu fonksiyon hem normal
// rezervasyon akışında (rides/[id]/page.tsx, sadece sürücü ilanlarında
// çağrılıyor, booker_role her zaman 'passenger') hem de chat/page.tsx'in
// "sürücü değilim" dalında kullanılıyor — ikinci kullanımda, bir yolcu
// ilanının SAHİBİ için "kendim" olan booking, ilana verilip onaylanan
// TEK teklif satırıdır (booker_role='driver'). Katı bir
// `.eq("booker_role","passenger")` filtresi bu satırı tamamen dışlar ve
// ilan sahibini kendi chat'inden KALICI olarak 404'e düşürür — mevcut
// haldeki "birden fazla bekleyen rakip teklif varsa 404" hatasından daha
// kötü bir regresyon olurdu. Bunun yerine satır ya booker_role='passenger'
// (normal rezervasyon, pending veya approved) ya da status='approved'
// (herhangi bir booker_role — ilana verilip KABUL EDİLMİŞ tek teklif)
// olmalı; bir ilanda aynı anda en fazla bir onaylı booking olabileceğinden
// (approve_booking, koltuk tükendiğinde ikinci onayı 'not_enough_seats' ile
// reddeder) bu ikinci dal de en fazla bir satırla eşleşir, maybeSingle()
// güvenle çalışır.
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
    .or("booker_role.eq.passenger,status.eq.approved")
    .maybeSingle()

  return data as Booking | null
}

// createOffer/OfferButton, bir sürücünün bir yolcu ilanına zaten aktif bir
// teklifi olup olmadığını (varsa durumunu) göstermek için kullanır —
// getMyBookingForRide'ın aynısı, ama passenger_id yerine driver_id/
// booker_role üzerinden (bir teklifte passenger_id ilan sahibidir, teklif
// veren sürücü değil).
export async function getMyOfferForRide(rideId: string, driverId: string): Promise<Booking | null> {
  if (!isSupabaseConfigured()) {
    return null
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("ride_id", rideId)
    .eq("driver_id", driverId)
    .eq("booker_role", "driver")
    .in("status", ["pending", "approved"])
    .maybeSingle()

  return data as Booking | null
}

// /bookings sayfasının "Verdiğim Teklifler" bölümü için — bir sürücünün
// başkalarının yolcu ilanlarına verdiği TÜM teklifler (durumu ne olursa
// olsun), en yeniden eskiye.
export async function getMyDriverOffers(driverId: string): Promise<BookingWithRide[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_RIDE_SELECT)
    .eq("driver_id", driverId)
    .eq("booker_role", "driver")
    .order("created_at", { ascending: false })

  return (data as BookingWithRide[] | null) ?? []
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
