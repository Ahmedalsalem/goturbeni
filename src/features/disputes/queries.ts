import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Dispute, DisputeWithParties } from "@/types/dispute"

const DISPUTE_WITH_PARTIES_SELECT =
  "*, opened_by_profile:profiles!disputes_opened_by_fkey(full_name), against_user_profile:profiles!disputes_against_user_id_fkey(full_name), booking:bookings(ride:rides(departure_city, arrival_city, departure_time))"

// One row per (booking, opener) — used to grey out "report a problem" once
// the current user already has an active dispute open on this booking (see
// disputes_one_active_per_booking_opener, 0044_disputes.sql).
export async function getMyDisputeForBooking(bookingId: string, userId: string): Promise<Dispute | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("disputes")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("opened_by", userId)
    .in("status", ["open", "in_review"])
    .maybeSingle()

  return (data as Dispute | null) ?? null
}

// Admin queue — RLS ("select own or against or admin") already lets an admin
// see every row, oldest-first so the longest-waiting complaint surfaces first
// (same ordering convention as getPendingDepositReceipts).
export async function getOpenDisputesForAdmin(): Promise<DisputeWithParties[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("disputes")
    .select(DISPUTE_WITH_PARTIES_SELECT)
    .in("status", ["open", "in_review"])
    .order("created_at", { ascending: true })

  return (data as unknown as DisputeWithParties[] | null) ?? []
}

// Used by the admin payments risk-triage (features/admin/risk.ts) to keep
// anyone with an active dispute out of the "low risk, bulk-approve" tier
// regardless of which side of the dispute they're on.
export async function getUserIdsWithOpenDisputes(): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase.from("disputes").select("opened_by, against_user_id").in("status", ["open", "in_review"])

  const ids = new Set<string>()
  for (const row of (data as { opened_by: string; against_user_id: string }[] | null) ?? []) {
    ids.add(row.opened_by)
    ids.add(row.against_user_id)
  }
  return ids
}

export async function getResolvedDisputesForAdmin(): Promise<DisputeWithParties[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("disputes")
    .select(DISPUTE_WITH_PARTIES_SELECT)
    .in("status", ["resolved", "dismissed"])
    .order("resolved_at", { ascending: false })
    .limit(50)

  return (data as unknown as DisputeWithParties[] | null) ?? []
}
