import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Review, ReviewStats, ReviewWithReviewer } from "@/types/review"

// profiles has two incoming FKs from reviews (reviewer_id, reviewed_user_id),
// so the embed must name the constraint to avoid PostgREST ambiguity errors.
const REVIEW_WITH_REVIEWER_SELECT = "*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)"

export async function getReviewStats(userId: string): Promise<ReviewStats> {
  const supabase = await createClient()
  const { data } = await supabase.from("reviews").select("rating").eq("reviewed_user_id", userId)
  const ratings = (data as { rating: number }[] | null) ?? []

  if (ratings.length === 0) {
    return { averageRating: null, reviewCount: 0 }
  }
  const sum = ratings.reduce((total, row) => total + row.rating, 0)
  return { averageRating: sum / ratings.length, reviewCount: ratings.length }
}

export async function getReviewsForUser(userId: string, limit?: number): Promise<ReviewWithReviewer[]> {
  const supabase = await createClient()
  let query = supabase
    .from("reviews")
    .select(REVIEW_WITH_REVIEWER_SELECT)
    .eq("reviewed_user_id", userId)
    .order("created_at", { ascending: false })
  if (limit) {
    query = query.limit(limit)
  }

  const { data } = await query
  return (data as ReviewWithReviewer[] | null) ?? []
}

// Scoped per (ride, reviewer, reviewee) — a driver with several approved
// passengers on the same ride reviews each one separately (see
// 0008_reviews_per_reviewee.sql).
export async function getMyReviewForRide(rideId: string, reviewerId: string, revieweeId: string): Promise<Review | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("ride_id", rideId)
    .eq("reviewer_id", reviewerId)
    .eq("reviewed_user_id", revieweeId)
    .maybeSingle()
  return data as Review | null
}

// "Toplam yolculuk" — completed trips as driver (own rides whose departure
// has passed) plus completed trips as passenger (approved bookings whose
// ride's departure has passed). rides.status never auto-transitions to
// 'completed' (see README → Bilinen Sınırlamalar), so this is computed from
// departure_time directly, same as the review-eligibility RLS check.
export async function getCompletedRidesCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const [{ count: asDriver }, { data: approvedBookings }] = await Promise.all([
    supabase.from("rides").select("id", { count: "exact", head: true }).eq("driver_id", userId).lt("departure_time", nowIso),
    supabase.from("bookings").select("ride:rides(departure_time)").eq("passenger_id", userId).eq("status", "approved"),
  ])

  const asPassenger = ((approvedBookings as { ride: { departure_time: string } | null }[] | null) ?? []).filter(
    (row) => row.ride && new Date(row.ride.departure_time).getTime() < Date.now()
  ).length

  return (asDriver ?? 0) + asPassenger
}
