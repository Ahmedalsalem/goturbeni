import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/types/profile"

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
  return data as Profile | null
}
