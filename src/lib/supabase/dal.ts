import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"

// Guest-friendly lookup — returns null for anonymous visitors, never redirects.
// Use on pages/routes where login is optional (e.g. /rides). Wrapped in
// React's cache() since the root layout's Header and the page body both call
// this on every request — cache() dedupes them into one auth round trip.
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) {
    return null
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

// Use on pages that require a signed-in user (e.g. /profile) — redirects to
// /login if there's no session.
export async function verifySession() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}
