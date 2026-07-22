import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/types/profile"

// Wrapped in React's cache() — several pages fetch the same user's profile
// more than once per request (e.g. header + page body); this dedupes those
// into a single Supabase round trip.
export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("*, profiles_private(phone, phone_verified)")
    .eq("id", userId)
    .single()
  if (!data) return null

  // profiles_private is only visible via RLS to the row's own owner — for
  // any other user's profile (e.g. a ride's driver) this embed is null,
  // which is fine since phone is never displayed for other users.
  const { profiles_private, ...profile } = data as typeof data & {
    profiles_private: { phone: string | null; phone_verified: boolean } | null
  }
  return {
    ...profile,
    phone: profiles_private?.phone ?? null,
    phone_verified: profiles_private?.phone_verified ?? false,
  } as Profile
})
