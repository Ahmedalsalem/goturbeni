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
// /login if there's no session. Also enforces suspension here (not in
// getCurrentUser, which is also used for public pages like / and /rides that
// suspended users must still be able to browse) — redirects to /suspended
// instead of letting a protected page render for a suspended account.
export async function verifySession() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  const supabase = await createClient()
  const { data: suspended } = await supabase.rpc("is_suspended", { p_user_id: user.id })
  if (suspended) {
    redirect("/suspended")
  }
  return user
}

// Use on actions/pages that require the mandatory one-time phone
// verification gate (posting a ride, booking a seat) — redirects to
// /verify-phone if the account never completed it. Verified accounts pass
// straight through; this is never re-checked per login/session, only per
// completion state.
export async function requireVerifiedProfile() {
  const user = await verifySession()
  const supabase = await createClient()
  const { data: privateRow } = await supabase
    .from("profiles_private")
    .select("phone_verified")
    .eq("id", user.id)
    .maybeSingle()
  if (!privateRow?.phone_verified) {
    redirect("/verify-phone")
  }
  return user
}
