import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { ProfileVerificationStatus } from "@/types/profile"
import type { BookingStatus } from "@/types/booking"
import type { RideWithDriver } from "@/types/ride"

const ADMIN_LIST_LIMIT = 100
const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles(full_name, avatar_url)"
const BOOKING_STATUSES: BookingStatus[] = ["pending", "approved", "rejected", "cancelled"]
const TREND_DAYS = 7

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("is_admin", { p_user_id: userId })
  return data === true
}

export interface AdminUserRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  verification_status: ProfileVerificationStatus
  created_at: string
  is_admin: boolean
  is_suspended: boolean
  // null = hidden from the admin view by profiles_private's RLS (owner-only
  // select, no is_admin() bypass — see 0006_profiles_phone_privacy.sql and
  // 0014_admin.sql, which deliberately doesn't touch that policy) — the
  // embed comes back null for every row except the querying admin's own.
  phone_verified: boolean | null
}

// admin_flags and profiles_private are both 1:1 with profiles (PK doubles as
// FK), so PostgREST embeds them as a single object (or null), same pattern
// as features/profile/queries.ts's profiles_private embed.
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, verification_status, created_at, admin_flags(is_admin, is_suspended), profiles_private(phone_verified)")
    .order("created_at", { ascending: false })
    .limit(ADMIN_LIST_LIMIT)

  const rows =
    (data as unknown as {
      id: string
      full_name: string | null
      avatar_url: string | null
      verification_status: ProfileVerificationStatus
      created_at: string
      admin_flags: { is_admin: boolean; is_suspended: boolean } | null
      profiles_private: { phone_verified: boolean } | null
    }[] | null) ?? []

  return rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    verification_status: row.verification_status,
    created_at: row.created_at,
    is_admin: row.admin_flags?.is_admin ?? false,
    is_suspended: row.admin_flags?.is_suspended ?? false,
    phone_verified: row.profiles_private?.phone_verified ?? null,
  }))
}

export async function getAdminRides(): Promise<RideWithDriver[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("rides")
    .select(RIDE_WITH_DRIVER_SELECT)
    .order("created_at", { ascending: false })
    .limit(ADMIN_LIST_LIMIT)

  return (data as RideWithDriver[] | null) ?? []
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
    Promise.all(BOOKING_STATUSES.map((status) => supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", status))),
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
