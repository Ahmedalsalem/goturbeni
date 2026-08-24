import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Booking, BookingStatus } from "@/types/booking"
import type { RideWithDriver } from "@/types/ride"

// Was a flat 100-row cap with no way to reach anything past it — on a
// pending-work queue (refunds/settlements) that means the oldest, most
// overdue rows are exactly the ones that silently disappear once volume
// grows (found in a post-launch audit). Paginated instead: PAGE_SIZE per
// page, callers get hasMore back to render a pager.
const ADMIN_PAGE_SIZE = 50
const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url)"
const BOOKING_STATUSES: BookingStatus[] = ["pending", "approved", "rejected", "cancelled"]
const TREND_DAYS = 7

export interface AdminPage<T> {
  rows: T[]
  hasMore: boolean
}

// Fetches one row past the page so hasMore is known without a separate
// (expensive on a growing table) exact-count query — split() below trims
// that extra row back off before returning to the caller.
function overfetchRangeFor(page: number): [number, number] {
  const start = (page - 1) * ADMIN_PAGE_SIZE
  return [start, start + ADMIN_PAGE_SIZE]
}

function splitPage<T>(overfetched: T[]): AdminPage<T> {
  return { rows: overfetched.slice(0, ADMIN_PAGE_SIZE), hasMore: overfetched.length > ADMIN_PAGE_SIZE }
}

export interface AdminBookingRow extends Booking {
  passenger: {
    id: string
    full_name: string | null
    created_at: string
    admin_flags: { is_suspended: boolean } | null
  } | null
  ride: { departure_city: string; arrival_city: string; driver: { full_name: string | null } | null }
}

// Passenger's id/created_at/admin_flags are pulled in (beyond just full_name)
// so the payments page can compute a risk tier (features/admin/risk.ts)
// without a second round-trip per row.
const ADMIN_BOOKING_SELECT =
  "*, passenger:profiles!bookings_passenger_id_fkey(id, full_name, created_at, admin_flags(is_suspended)), ride:rides(departure_city, arrival_city, driver:profiles!rides_driver_id_fkey(full_name))"

// Refunds where the driver already uploaded proof and it's waiting on an
// admin to confirm — see submit_refund_proof/admin_confirm_refund
// (0021_cancellation_refunds.sql).
export async function getPendingRefunds(page: number = 1): Promise<AdminPage<AdminBookingRow>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(ADMIN_BOOKING_SELECT)
    .eq("refund_status", "proof_submitted")
    .order("refund_requested_at", { ascending: true })
    .range(...overfetchRangeFor(page))

  return splitPage((data as unknown as AdminBookingRow[] | null) ?? [])
}

// Settlement (post-trip full-fare) receipts a passenger uploaded but
// nobody has reviewed yet — see submit_settlement_receipt/
// admin_review_settlement_receipt (0025_settlement_receipts_and_reject_reasons.sql).
export async function getPendingSettlementReceipts(page: number = 1): Promise<AdminPage<AdminBookingRow>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(ADMIN_BOOKING_SELECT)
    .eq("settlement_receipt_status", "pending")
    .order("settlement_receipt_reviewed_at", { ascending: true, nullsFirst: true })
    .range(...overfetchRangeFor(page))

  return splitPage((data as unknown as AdminBookingRow[] | null) ?? [])
}

// Lets an admin visually cross-check the driver's registered IBAN/holder
// name against an uploaded receipt while reviewing it — profiles_private has
// no admin bypass (see AdminUserRow above), so this goes through a scoped
// security-definer RPC instead (admin_get_driver_payment_info, 0025).
export async function getDriverPaymentInfoForAdmin(
  bookingId: string
): Promise<{ iban: string; iban_holder_name: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("admin_get_driver_payment_info", { p_booking_id: bookingId }).maybeSingle()
  const row = data as { iban: string | null; iban_holder_name: string | null } | null
  if (!row?.iban || !row?.iban_holder_name) {
    return null
  }
  return { iban: row.iban, iban_holder_name: row.iban_holder_name }
}

export type SuspiciousAccountReason =
  | "ride_spam"
  | "high_cancellation_rate"
  | "high_rejection_rate"
  | "booking_spam"
  | "new_account_high_value"
  | "frequent_late_cancellation"
  | "frequent_passenger_no_show"
  | "frequent_driver_no_show"
  | "duplicate_iban"
  | "disputed_repeatedly"
  | "repeated_receipt_rejection"

export interface SuspiciousAccountRow {
  user_id: string
  full_name: string | null
  is_suspended: boolean
  reason: SuspiciousAccountReason
  detail: string
}

// Rule-based abuse/fraud flagging (v2) — see admin_get_suspicious_accounts
// (latest version in 0046_suspicious_accounts_fraud_v2.sql) for all current
// heuristics and their thresholds. Not an ML system, no external service —
// pure SQL aggregates over rides/bookings/profiles_private/disputes,
// admin-only via is_admin() inside the RPC.
export async function getSuspiciousAccounts(): Promise<SuspiciousAccountRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("admin_get_suspicious_accounts")
  return (data as SuspiciousAccountRow[] | null) ?? []
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("is_admin", { p_user_id: userId })
  return data === true
}

export interface AdminUserRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  is_admin: boolean
  is_suspended: boolean
  // From admin_get_user_emails (auth.users isn't reachable through
  // PostgREST) — null only if that RPC call fails outright.
  email: string | null
}

// admin_flags is 1:1 with profiles (PK doubles as FK), so PostgREST embeds
// it as a single object (or null), same pattern as
// features/profile/queries.ts's profiles_private embed.
export async function getAdminUsers(page: number = 1): Promise<AdminPage<AdminUserRow>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, created_at, admin_flags(is_admin, is_suspended)")
    .order("created_at", { ascending: false })
    .range(...overfetchRangeFor(page))

  const overfetched =
    (data as unknown as
      | {
          id: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          admin_flags: { is_admin: boolean; is_suspended: boolean } | null
        }[]
      | null) ?? []
  const { rows, hasMore } = splitPage(overfetched)

  const { data: emailRows } = await supabase.rpc("admin_get_user_emails", { p_user_ids: rows.map((row) => row.id) })
  const emailsById = new Map(
    ((emailRows as { id: string; email: string | null }[] | null) ?? []).map((row) => [row.id, row.email])
  )

  return {
    hasMore,
    rows: rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
      is_admin: row.admin_flags?.is_admin ?? false,
      is_suspended: row.admin_flags?.is_suspended ?? false,
      email: emailsById.get(row.id) ?? null,
    })),
  }
}

export async function getAdminRides(page: number = 1): Promise<AdminPage<RideWithDriver>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("rides")
    .select(RIDE_WITH_DRIVER_SELECT)
    .order("created_at", { ascending: false })
    .range(...overfetchRangeFor(page))

  return splitPage((data as RideWithDriver[] | null) ?? [])
}

export interface AdminStats {
  totalUsers: number
  totalRides: number
  totalBookings: number
  bookingsByStatus: Record<BookingStatus, number>
  usersLast7Days: number
  usersLast30Days: number
  ridesLast7Days: number
  ridesLast30Days: number
  // Rides created per day over the last 7 days, oldest first — backs the
  // plain-div bar chart on the analytics page (no charting library).
  ridesByDay: { date: string; count: number }[]
}

function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

function buildRidesByDay(rows: { created_at: string }[], now: Date): { date: string; count: number }[] {
  const buckets = new Map<string, number>()
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    buckets.set(daysAgoIso(now, i).slice(0, 10), 0)
  }
  for (const row of rows) {
    const key = row.created_at.slice(0, 10)
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient()
  const now = new Date()
  const sevenDaysAgo = daysAgoIso(now, 7)
  const thirtyDaysAgo = daysAgoIso(now, 30)

  const [
    { count: totalUsers },
    { count: totalRides },
    { count: totalBookings },
    { count: usersLast7Days },
    { count: usersLast30Days },
    { count: ridesLast7Days },
    { count: ridesLast30Days },
    bookingStatusCounts,
    { data: recentRides },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("rides").select("id", { count: "exact", head: true }),
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    supabase.from("rides").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("rides").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    Promise.all(
      BOOKING_STATUSES.map((status) =>
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", status)
      )
    ),
    supabase.from("rides").select("created_at").gte("created_at", sevenDaysAgo),
  ])

  const bookingsByStatus = BOOKING_STATUSES.reduce(
    (acc, status, index) => {
      acc[status] = bookingStatusCounts[index].count ?? 0
      return acc
    },
    {} as Record<BookingStatus, number>
  )

  return {
    totalUsers: totalUsers ?? 0,
    totalRides: totalRides ?? 0,
    totalBookings: totalBookings ?? 0,
    bookingsByStatus,
    usersLast7Days: usersLast7Days ?? 0,
    usersLast30Days: usersLast30Days ?? 0,
    ridesLast7Days: ridesLast7Days ?? 0,
    ridesLast30Days: ridesLast30Days ?? 0,
    ridesByDay: buildRidesByDay((recentRides as { created_at: string }[] | null) ?? [], now),
  }
}
