import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { PickupCode } from "@/types/pickup"

// Passenger-only read — get_my_pickup_code (0048_pickup_verification_code.sql)
// checks auth.uid() = booking.passenger_id itself; there is no RLS select
// policy on booking_pickup_codes at all; this RPC is the only way to read a
// code. Returns null before approval (no row exists yet).
export async function getMyPickupCode(bookingId: string): Promise<PickupCode | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_my_pickup_code", { p_booking_id: bookingId }).maybeSingle()
  return (data as PickupCode | null) ?? null
}

// Either party can check this — unlike getMyPickupCode, it never exposes the
// code itself, only whether verify_pickup_code already succeeded. Used by
// the driver's booking panel to swap the code-entry form for a "picked up"
// badge once verified.
export async function getPickupVerificationStatus(bookingId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_pickup_verification_status", { p_booking_id: bookingId })
  return data === true
}
