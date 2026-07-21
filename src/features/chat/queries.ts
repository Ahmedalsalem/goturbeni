import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Message } from "@/types/message"

export interface ApprovedPassenger {
  id: string
  full_name: string | null
  avatar_url: string | null
}

// Full conversation between two users scoped to one ride, oldest first.
export async function getMessages(rideId: string, userAId: string, userBId: string): Promise<Message[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("ride_id", rideId)
    .or(`and(sender_id.eq.${userAId},receiver_id.eq.${userBId}),and(sender_id.eq.${userBId},receiver_id.eq.${userAId})`)
    .order("created_at", { ascending: true })

  return (data as Message[] | null) ?? []
}

// A ride can have several approved passengers (seat_count > 1); the driver
// picks which conversation to open (see PassengerPicker).
export async function getApprovedPassengers(rideId: string): Promise<ApprovedPassenger[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("passenger_id, passenger:profiles(full_name, avatar_url)")
    .eq("ride_id", rideId)
    .eq("status", "approved")

  const rows = (data as { passenger_id: string; passenger: { full_name: string | null; avatar_url: string | null } | null }[] | null) ?? []

  return rows.map((row) => ({
    id: row.passenger_id,
    full_name: row.passenger?.full_name ?? null,
    avatar_url: row.passenger?.avatar_url ?? null,
  }))
}
